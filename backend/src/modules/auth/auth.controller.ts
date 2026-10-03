import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, type AuthUser } from '../../common/auth.decorators.js';
import { AuthService } from './auth.service.js';
import { LoginDto, RefreshDto, RegisterDto, VerifyOtpDto } from './dto/auth.dto.js';
import { OtpService } from './otp.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OtpService) private readonly otp: OtpService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  // Mock OTP in Phase 2 (code 123456, development only). Real provider in Phase 9.

  @ApiBearerAuth()
  @Post('otp/send')
  @HttpCode(200)
  sendOtp(@CurrentUser() user: AuthUser) {
    return this.otp.sendPhoneVerification(user.id);
  }

  @ApiBearerAuth()
  @Post('otp/verify')
  @HttpCode(204)
  async verifyOtp(@CurrentUser() user: AuthUser, @Body() dto: VerifyOtpDto): Promise<void> {
    await this.otp.verifyPhone(user.id, dto.code);
  }
}
