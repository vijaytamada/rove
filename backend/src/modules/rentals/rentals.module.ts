import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { SettlementsModule } from '../settlements/settlements.module.js';
import { RentalsController } from './rentals.controller.js';
import { RentalsService } from './rentals.service.js';

@Module({
  imports: [PaymentsModule, SettlementsModule],
  controllers: [RentalsController],
  providers: [RentalsService],
  exports: [RentalsService],
})
export class RentalsModule {}
