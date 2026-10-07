import { Module } from '@nestjs/common';
import { KycProviderModule } from '../../providers/kyc/kyc-provider.module.js';
import { KycController } from './kyc.controller.js';
import { KycService } from './kyc.service.js';

@Module({
  imports: [KycProviderModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
