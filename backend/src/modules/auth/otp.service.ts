import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/app-exception.js';
import type { Env } from '../../config/env.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { OTP_PROVIDER, type OtpProvider } from '../../providers/otp/otp.provider.js';
import { UsersService } from '../users/users.service.js';

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_PHONE_PER_HOUR = 5;
const SIGNUP_TICKET_TTL_SECONDS = 10 * 60;

export interface OtpSent {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

interface Challenge {
  challengeId: string;
  phone: string;
  attempts: number;
}

const tooSoon = () => new AppException(429, 'OTP_RESEND_TOO_SOON', 'Wait a moment before requesting another code.');
const expired = () => new AppException(400, 'OTP_EXPIRED', 'That code has expired. Request a new one.');

/**
 * One-time codes for (a) signing in with a phone number and (b) verifying a profile phone (existing unverified number, or a new number before it is saved).
 * Rules (expiry, resend cooldown, attempt limit, send caps) live here so they stay identical when the
 * mock provider is replaced by a real one (Phase 9). The provider only sends and checks codes.
 *
 * Abuse limits: 30 s between sends, 5 sends per phone per hour, 5 wrong attempts per code, and a
 * daily cap on total sends (guards against SMS-pumping and runaway cost). Redis keys:
 *   otp:<scope>:<id>            the active challenge
 *   otp:cooldown:<scope>:<id>   resend cooldown
 *   otp:sends:<phone>           sends this hour
 *   otp:daily:<yyyymmdd>        sends today (all phones)
 *   signup:<token>              single-use ticket for finishing sign-up
 */
@Injectable()
export class OtpService {
  private readonly dailyCap: number;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.dailyCap = config.get('OTP_DAILY_SEND_CAP', { infer: true });
  }

  // ---------------- Sign in with phone ----------------

  /**
   * Sends a sign-in code. The response is identical whether or not the number has an account (no
   * account enumeration). Numbers that belong to staff are never sent a code: staff use passwords.
   */
  async requestLoginCode(phone: string): Promise<OtpSent> {
    const user = await this.users.getByPhone(phone);
    const sendsCode = !user || user.role === 'CUSTOMER';
    await this.startChallenge('login', phone, phone, sendsCode);
    return { expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
  }

  /** Throws unless `code` is the valid, unexpired code for this phone. */
  async verifyLoginCode(phone: string, code: string): Promise<void> {
    await this.checkChallenge('login', phone, phone, code);
  }

  /** After a verified code for an unknown number: a single-use ticket to finish creating the account. */
  async createSignupTicket(phone: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.client.set(`signup:${token}`, phone, 'EX', SIGNUP_TICKET_TTL_SECONDS);
    return token;
  }

  /** Returns the phone the ticket was issued for and invalidates the ticket. */
  async consumeSignupTicket(token: string): Promise<string> {
    const phone = await this.redis.client.getdel(`signup:${token}`);
    if (!phone) {
      throw new AppException(400, 'SIGNUP_EXPIRED', 'This sign-up link has expired. Start again with your phone number.');
    }
    return phone;
  }

  // ---------------- Verify a changed profile phone ----------------

  async sendPhoneVerification(userId: string): Promise<OtpSent> {
    const user = await this.users.getById(userId);
    if (!user.phone) {
      throw new AppException(400, 'PHONE_REQUIRED', 'Add a phone number to your profile first.');
    }
    if (user.phoneVerifiedAt) {
      throw new AppException(409, 'PHONE_ALREADY_VERIFIED', 'Your phone number is already verified.');
    }
    await this.startChallenge('verify', userId, user.phone, true);
    return { expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
  }

  async verifyPhone(userId: string, code: string): Promise<void> {
    const user = await this.users.getById(userId);
    // The code belongs to the number it was sent to; a changed number invalidates it.
    const challenge = await this.load('verify', userId);
    if (challenge && challenge.phone !== user.phone) {
      await this.redis.client.del(this.key('verify', userId));
    }
    await this.checkChallenge('verify', userId, user.phone ?? '', code);
    await this.users.markPhoneVerified(userId);
  }

  // ---------------- Change the profile phone: the NEW number is saved only after its code is confirmed ----------------

  async requestPhoneChange(userId: string, phone: string): Promise<OtpSent> {
    const user = await this.users.getById(userId);
    if (user.phone === phone && user.phoneVerifiedAt) {
      throw new AppException(409, 'PHONE_UNCHANGED', 'That is already your verified number.');
    }
    await this.users.assertPhoneAvailable(phone, userId);
    await this.startChallenge('change', userId, phone, true);
    return { expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
  }

  async confirmPhoneChange(userId: string, code: string): Promise<void> {
    const challenge = await this.load('change', userId);
    if (!challenge) throw expired();
    await this.checkChallenge('change', userId, challenge.phone, code);
    await this.users.setVerifiedPhone(userId, challenge.phone);
  }

  // ---------------- Shared challenge handling ----------------

  private key(scope: string, id: string) {
    return `otp:${scope}:${id}`;
  }

  private async load(scope: string, id: string): Promise<Challenge | null> {
    const raw = await this.redis.client.get(this.key(scope, id));
    return raw ? (JSON.parse(raw) as Challenge) : null;
  }

  private async startChallenge(scope: string, id: string, phone: string, send: boolean): Promise<void> {
    const cooldown = await this.redis.client.set(`otp:cooldown:${scope}:${id}`, '1', 'EX', RESEND_COOLDOWN_SECONDS, 'NX');
    if (cooldown !== 'OK') throw tooSoon();

    const sends = await this.redis.client.incr(`otp:sends:${phone}`);
    if (sends === 1) await this.redis.client.expire(`otp:sends:${phone}`, 60 * 60);
    if (sends > MAX_SENDS_PER_PHONE_PER_HOUR) {
      throw new AppException(429, 'OTP_TOO_MANY_REQUESTS', 'Too many codes requested for this number. Try again in an hour.');
    }

    if (!send) return; // Same response and timing, but no code for numbers that can't sign in this way.

    const dailyKey = `otp:daily:${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
    const today = await this.redis.client.incr(dailyKey);
    if (today === 1) await this.redis.client.expire(dailyKey, 2 * 24 * 60 * 60);
    if (today > this.dailyCap) {
      throw new AppException(503, 'OTP_UNAVAILABLE', "We can't send codes right now. Try again later.");
    }

    const { challengeId } = await this.provider.send({ phone, purpose: 'PHONE_VERIFICATION' });
    const challenge: Challenge = { challengeId, phone, attempts: 0 };
    await this.redis.client.set(this.key(scope, id), JSON.stringify(challenge), 'EX', OTP_TTL_SECONDS);
  }

  private async checkChallenge(scope: string, id: string, phone: string, code: string): Promise<void> {
    const challenge = await this.load(scope, id);
    if (!challenge || challenge.phone !== phone) throw expired();

    if (challenge.attempts >= MAX_ATTEMPTS) {
      await this.redis.client.del(this.key(scope, id));
      throw new AppException(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many attempts. Request a new code.');
    }

    const ok = await this.provider.verify({ challengeId: challenge.challengeId, code });
    if (!ok) {
      challenge.attempts += 1;
      const ttl = await this.redis.client.ttl(this.key(scope, id));
      if (ttl > 0) await this.redis.client.set(this.key(scope, id), JSON.stringify(challenge), 'EX', ttl);
      throw new AppException(400, 'OTP_INVALID', "That code isn't right. Try again.");
    }
    await this.redis.client.del(this.key(scope, id));
  }
}
