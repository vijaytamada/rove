import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { KycService } from './kyc.service.js';
import { RateLimit } from '../../infra/rate-limit/rate-limit.guard.js';

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

/** Support: gives a customer who ran out of identity-check tries a fresh set. */
@ApiTags('kyc')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('kyc')
export class KycAdminController {
  constructor(@Inject(KycService) private readonly kyc: KycService) {}

  @Post(':id/reset')
  @HttpCode(200)
  reset(@Param('id', ParseUUIDPipe) userId: string) {
    return this.kyc.reset(userId);
  }
}

/** Where the identity provider reports its answer. Public, but every message must carry a valid signature. */
@ApiExcludeController()
@Public()
@RateLimit('webhook-kyc', 300, 60)
@Controller('webhooks/kyc')
export class KycWebhookController {
  constructor(@Inject(KycService) private readonly kyc: KycService) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
    await this.kyc.handleWebhook({ rawBody: req.rawBody, headers });
    return { received: true };
  }
}
