import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { KycModule } from '../kyc/kyc.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [PricingModule, KycModule, PaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
