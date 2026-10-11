import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { VehicleModelsService } from './vehicle-models.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

@Module({
  imports: [PricingModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehicleModelsService],
  exports: [VehiclesService, VehicleModelsService],
})
export class VehiclesModule {}
