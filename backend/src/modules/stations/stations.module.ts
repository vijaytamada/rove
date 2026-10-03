import { Module } from '@nestjs/common';
import { CitiesModule } from '../cities/cities.module.js';
import { StationsController } from './stations.controller.js';
import { StationsService } from './stations.service.js';

@Module({
  imports: [CitiesModule],
  controllers: [StationsController],
  providers: [StationsService],
  exports: [StationsService],
})
export class StationsModule {}
