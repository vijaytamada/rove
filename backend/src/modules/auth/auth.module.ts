import { Module } from '@nestjs/common';
import { OtpProviderModule } from '../../providers/otp/otp-provider.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { OtpService } from './otp.service.js';
import { TokensService } from './tokens.service.js';

@Module({
  imports: [UsersModule, OtpProviderModule],
  controllers: [AuthController],
  providers: [AuthService, TokensService, OtpService, LoginThrottleService],
})
export class AuthModule {}
