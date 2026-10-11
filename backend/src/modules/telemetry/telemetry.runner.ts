import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { TELEMETRY_PROVIDER, type TelemetryProvider } from '../../providers/telemetry/telemetry.provider.js';
import { TelemetryService } from './telemetry.service.js';

/** Starts the telemetry provider with the backend and stops it on shutdown. */
@Injectable()
export class TelemetryRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelemetryRunner.name);

  constructor(
    @Inject(TELEMETRY_PROVIDER) private readonly provider: TelemetryProvider,
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {}

  onApplicationBootstrap() {
    this.provider.start(this.telemetry);
    this.logger.log(`Telemetry provider: ${this.provider.name}`);
  }

  onApplicationShutdown() {
    this.provider.stop();
  }
}
