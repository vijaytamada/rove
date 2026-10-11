import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { KYC_PROVIDER } from './kyc.provider.js';
import { MockKycProvider } from './mock-kyc.provider.js';

/** Picks the KYC provider from KYC_PROVIDER. Add the real provider here in Phase 9. */
@Module({
  providers: [
    {
      provide: KYC_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const kind = config.get('KYC_PROVIDER', { infer: true });
        switch (kind) {
          case 'mock':
            return new MockKycProvider(config);
          default:
            throw new Error(`Unknown KYC_PROVIDER: ${String(kind)}`);
        }
      },
    },
  ],
  exports: [KYC_PROVIDER],
})
export class KycProviderModule {}
