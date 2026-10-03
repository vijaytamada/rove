import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { User } from '../../generated/prisma/client.js';
import { PasswordService } from '../users/password.service.js';
import { UsersService, type UserView } from '../users/users.service.js';
import type { LoginDto, PhoneSignupDto, PhoneVerifyDto } from './dto/auth.dto.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { OtpService, type OtpSent } from './otp.service.js';
import { TokensService, type TokenPair } from './tokens.service.js';

export type AuthResult = TokenPair & { user: UserView };

/** Result of checking a sign-in code: either signed in, or the number is new and needs a name. */
export type PhoneVerifyResult =
  | ({ status: 'SIGNED_IN' } & AuthResult)
  | { status: 'NEEDS_NAME'; signupToken: string };

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
    @Inject(OtpService) private readonly otp: OtpService,
  ) {}

  // ---------------- Customers: phone + one-time code ----------------

  requestPhoneCode(phone: string): Promise<OtpSent> {
    return this.otp.requestLoginCode(phone);
  }

  /**
   * Checks the code. Known number: signs in. Unknown number: returns a single-use ticket so the
   * client can ask for a name and finish with phoneSignup (the account is only created then).
   */
  async verifyPhoneCode(dto: PhoneVerifyDto): Promise<PhoneVerifyResult> {
    await this.otp.verifyLoginCode(dto.phone, dto.code);
    const user = await this.users.getByPhone(dto.phone);

    if (!user) return { status: 'NEEDS_NAME', signupToken: await this.otp.createSignupTicket(dto.phone) };
    if (user.role !== 'CUSTOMER') throw this.invalidCredentials(); // staff sign in with a password
    if (user.status !== 'ACTIVE') throw this.disabled();

    if (!user.phoneVerifiedAt) await this.users.markPhoneVerified(user.id);
    return { status: 'SIGNED_IN', ...(await this.signIn(user)) };
  }

  async completePhoneSignup(dto: PhoneSignupDto): Promise<AuthResult> {
    const phone = await this.otp.consumeSignupTicket(dto.signupToken);
    const existing = await this.users.getByPhone(phone);
    // Someone may have finished sign-up in another tab; just sign them in.
    const user = existing ?? (await this.users.createCustomer({ phone, fullName: dto.fullName }));
    if (user.role !== 'CUSTOMER') throw this.invalidCredentials();
    if (user.status !== 'ACTIVE') throw this.disabled();
    return this.signIn(user);
  }

  // ---------------- Staff: email + password ----------------

  async login(dto: LoginDto): Promise<AuthResult> {
    await this.throttle.assertAllowed(dto.email);
    const user = await this.users.getByEmail(dto.email);
    const ok = await this.passwords.verify(user?.passwordHash ?? null, dto.password);
    // Customers have no password (they use their phone); a customer account never passes here.
    if (!user || !ok || user.role === 'CUSTOMER') {
      await this.throttle.recordFailure(dto.email);
      throw this.invalidCredentials();
    }
    await this.throttle.reset(dto.email);
    if (user.status !== 'ACTIVE') throw this.disabled();
    return this.signIn(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { user, tokens } = await this.tokens.rotate(refreshToken);
    return { ...tokens, user: await this.users.getView(user.id) };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  private async signIn(user: User): Promise<AuthResult> {
    return { ...(await this.tokens.issue(user)), user: await this.users.getView(user.id) };
  }

  private invalidCredentials() {
    return new AppException(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  private disabled() {
    return new AppException(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
  }
}
