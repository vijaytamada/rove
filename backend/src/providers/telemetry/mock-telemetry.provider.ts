import { Injectable } from '@nestjs/common';
import type { TelemetryHost, TelemetryProvider } from './telemetry.provider.js';

/** Makes nothing up: readings arrive only through POST /telemetry (tests, a real device gateway). */
@Injectable()
export class MockTelemetryProvider implements TelemetryProvider {
  readonly name = 'mock';

  start(_host: TelemetryHost): void {}

  stop(): void {}
}
