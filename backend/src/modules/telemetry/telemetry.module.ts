import { Module } from '@nestjs/common';
import { TelemetryProviderModule } from '../../providers/telemetry/telemetry-provider.module.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryRunner } from './telemetry.runner.js';
import { TelemetryService } from './telemetry.service.js';

@Module({
  imports: [TelemetryProviderModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryRunner],
  exports: [TelemetryService],
})
export class TelemetryModule {}
