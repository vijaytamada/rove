import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [BookingsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
