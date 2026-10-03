import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_PATTERN } from '../../users/dto/user.dto.js';

/** Staff sign-in (customers use their phone number). */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refreshToken!: string;
}

/** Profile phone verification (after a phone number change). */
export class VerifyOtpDto {
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  @Length(6, 6)
  code!: string;
}

export class PhoneRequestDto {
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;
}

export class PhoneVerifyDto {
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PhoneSignupDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  signupToken!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName!: string;
}
