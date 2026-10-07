import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller.js';
import { PricingPlansService } from './pricing-plans.service.js';

@Module({
  controllers: [PricingController],
  providers: [PricingPlansService],
  exports: [PricingPlansService],
})
export class PricingModule {}
