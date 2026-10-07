import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { RentalsController } from './rentals.controller.js';
import { RentalsService } from './rentals.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [RentalsController],
  providers: [RentalsService],
  exports: [RentalsService],
})
export class RentalsModule {}
