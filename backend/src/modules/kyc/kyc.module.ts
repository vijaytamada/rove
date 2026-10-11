import { Module } from '@nestjs/common';
import { KycProviderModule } from '../../providers/kyc/kyc-provider.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { KycAdminController, KycController, KycWebhookController } from './kyc.controller.js';
import { KycService } from './kyc.service.js';

@Module({
  imports: [KycProviderModule, NotificationsModule],
  controllers: [KycController, KycAdminController, KycWebhookController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
