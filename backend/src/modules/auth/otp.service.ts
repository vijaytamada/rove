import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { OTP_PROVIDER, type OtpProvider } from '../../providers/otp/otp.provider.js';
import { UsersService } from '../users/users.service.js';

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_ATTEMPTS = 5;

interface Challenge {
  challengeId: string;
  phone: string;
  attempts: number;
}

/**
 * Phone verification flow. Rules (expiry, resend cooldown, attempt limit) live here so they
 * stay the same when the mock provider is replaced by a real one (Phase 9).
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async sendPhoneVerification(userId: string): Promise<{ expiresInSeconds: number }> {
    const user = await this.users.getById(userId);
    if (!user.phone) {
      throw new AppException(400, 'PHONE_REQUIRED', 'Add a phone number to your profile first.');
    }
    if (user.phoneVerifiedAt) {
      throw new AppException(409, 'PHONE_ALREADY_VERIFIED', 'Your phone number is already verified.');
    }

    const cooldownKey = `otp:cooldown:${userId}`;
    const acquired = await this.redis.client.set(cooldownKey, '1', 'EX', RESEND_COOLDOWN_SECONDS, 'NX');
    if (acquired !== 'OK') {
      throw new AppException(429, 'OTP_RESEND_TOO_SOON', 'Wait a moment before requesting another code.');
    }

    const { challengeId } = await this.provider.send({ phone: user.phone, purpose: 'PHONE_VERIFICATION' });
    const challenge: Challenge = { challengeId, phone: user.phone, attempts: 0 };
    await this.redis.client.set(this.key(userId), JSON.stringify(challenge), 'EX', OTP_TTL_SECONDS);
    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyPhone(userId: string, code: string): Promise<void> {
    const raw = await this.redis.client.get(this.key(userId));
    if (!raw) throw new AppException(400, 'OTP_EXPIRED', 'That code has expired. Request a new one.');
    const challenge = JSON.parse(raw) as Challenge;

    const user = await this.users.getById(userId);
    if (user.phone !== challenge.phone) {
      await this.redis.client.del(this.key(userId));
      throw new AppException(400, 'OTP_EXPIRED', 'That code has expired. Request a new one.');
    }

    if (challenge.attempts >= MAX_ATTEMPTS) {
      await this.redis.client.del(this.key(userId));
      throw new AppException(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many attempts. Request a new code.');
    }

    const ok = await this.provider.verify({ challengeId: challenge.challengeId, code });
    if (!ok) {
      challenge.attempts += 1;
      const ttl = await this.redis.client.ttl(this.key(userId));
      if (ttl > 0) await this.redis.client.set(this.key(userId), JSON.stringify(challenge), 'EX', ttl);
      throw new AppException(400, 'OTP_INVALID', "That code isn't right. Try again.");
    }

    await this.redis.client.del(this.key(userId));
    await this.users.markPhoneVerified(userId);
  }

  private key(userId: string) {
    return `otp:phone:${userId}`;
  }
}
