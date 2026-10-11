import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { MockTelemetryProvider } from './mock-telemetry.provider.js';
import { SimulatorTelemetryProvider } from './simulator-telemetry.provider.js';
import { TELEMETRY_PROVIDER } from './telemetry.provider.js';

/** Picks the telemetry source from TELEMETRY_PROVIDER. A real device gateway is added here in Phase 12. */
@Module({
  providers: [
    {
      provide: TELEMETRY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const kind = config.get('TELEMETRY_PROVIDER', { infer: true });
        switch (kind) {
          case 'mock':
            return new MockTelemetryProvider();
          case 'simulator':
            return new SimulatorTelemetryProvider();
          default:
            throw new Error(`Unknown TELEMETRY_PROVIDER: ${String(kind)}`);
        }
      },
    },
  ],
  exports: [TELEMETRY_PROVIDER],
})
export class TelemetryProviderModule {}
