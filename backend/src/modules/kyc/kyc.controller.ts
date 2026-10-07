import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { KycService } from './kyc.service.js';

class StartKycDto {
  @IsBoolean()
  consent!: boolean;
}

@ApiTags('kyc')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('kyc')
export class KycController {
  constructor(@Inject(KycService) private readonly kyc: KycService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.kyc.status(user.id);
  }

  @Post('start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Body() dto: StartKycDto) {
    return this.kyc.start(user.id, dto.consent);
  }
}
