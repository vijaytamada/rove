import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import { PasswordService } from '../users/password.service.js';
import { UsersService, type UserView } from '../users/users.service.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { TokensService, type TokenPair } from './tokens.service.js';

export type AuthResult = TokenPair & { user: UserView };

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
  ) {}

  /** Public registration always creates a CUSTOMER. Staff are created by a super admin. */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.users.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      phone: dto.phone,
      role: 'CUSTOMER',
    });
    return { ...(await this.tokens.issue(user)), user: await this.users.getView(user.id) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    await this.throttle.assertAllowed(dto.email);
    const user = await this.users.getByEmail(dto.email);
    const ok = await this.passwords.verify(user?.passwordHash ?? null, dto.password);
    if (!user || !ok) {
      await this.throttle.recordFailure(dto.email);
      throw new AppException(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    await this.throttle.reset(dto.email);
    if (user.status !== 'ACTIVE') {
      throw new AppException(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
    }
    return { ...(await this.tokens.issue(user)), user: await this.users.getView(user.id) };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { user, tokens } = await this.tokens.rotate(refreshToken);
    return { ...tokens, user: await this.users.getView(user.id) };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }
}
