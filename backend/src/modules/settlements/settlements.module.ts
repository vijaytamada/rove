import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { BookingSettlementController, StaffSettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [BookingSettlementController, StaffSettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
