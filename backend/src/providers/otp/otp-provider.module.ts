import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { MockOtpProvider } from './mock-otp.provider.js';
import { OTP_PROVIDER } from './otp.provider.js';

/** Picks the OTP provider from OTP_PROVIDER. Add real providers here in Phase 9. */
@Module({
  providers: [
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const kind = config.get('OTP_PROVIDER', { infer: true });
        switch (kind) {
          case 'mock':
            return new MockOtpProvider();
          default:
            throw new Error(`Unknown OTP_PROVIDER: ${String(kind)}`);
        }
      },
    },
  ],
  exports: [OTP_PROVIDER],
})
export class OtpProviderModule {}
