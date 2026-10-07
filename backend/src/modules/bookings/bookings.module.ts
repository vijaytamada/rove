import { Module } from '@nestjs/common';
import { PaymentProviderModule } from '../../providers/payment/payment-provider.module.js';
import { KycModule } from '../kyc/kyc.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [PricingModule, KycModule, PaymentProviderModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
