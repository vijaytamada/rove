import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { MockPaymentProvider } from './mock-payment.provider.js';
import { PAYMENT_PROVIDER } from './payment.provider.js';

/** Picks the payment provider from PAYMENT_PROVIDER. Add the real gateway here in Phase 10. */
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const kind = config.get('PAYMENT_PROVIDER', { infer: true });
        switch (kind) {
          case 'mock':
            return new MockPaymentProvider();
          default:
            throw new Error(`Unknown PAYMENT_PROVIDER: ${String(kind)}`);
        }
      },
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentProviderModule {}
