import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, type AuthUser } from '../../common/auth.decorators.js';
import { AuthService } from './auth.service.js';
import { LoginDto, PhoneRequestDto, PhoneSignupDto, PhoneVerifyDto, RefreshDto, VerifyOtpDto } from './dto/auth.dto.js';
import { OtpService } from './otp.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OtpService) private readonly otp: OtpService,
  ) {}

  // ---- Customers: phone number + one-time code (mock provider until Phase 9: code 123456, dev only) ----

  /** Sends a code. Same response for known and unknown numbers. */
  @Public()
  @Post('phone/request')
  @HttpCode(200)
  requestPhoneCode(@Body() dto: PhoneRequestDto) {
    return this.auth.requestPhoneCode(dto.phone);
  }

  /** Known number: signs in. New number: `{ status: 'NEEDS_NAME', signupToken }`. */
  @Public()
  @Post('phone/verify')
  @HttpCode(200)
  verifyPhoneCode(@Body() dto: PhoneVerifyDto) {
    return this.auth.verifyPhoneCode(dto);
  }

  /** Finishes sign-up for a new number with the ticket from phone/verify. */
  @Public()
  @Post('phone/signup')
  @HttpCode(200)
  completePhoneSignup(@Body() dto: PhoneSignupDto) {
    return this.auth.completePhoneSignup(dto);
  }

  // ---- Staff: email + password ----

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // ---- Sessions ----

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

  // ---- Verify a phone number changed in the profile ----

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
