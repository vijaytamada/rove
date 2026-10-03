import { Module } from '@nestjs/common';
import { VehicleModelsService } from './vehicle-models.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService, VehicleModelsService],
  exports: [VehiclesService, VehicleModelsService],
})
export class VehiclesModule {}
