import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { PaymentProvider, ProviderResult } from './payment.provider.js';

/** Development-only provider: no money moves. Every charge and refund succeeds unless a charge asks to fail. */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockPaymentProvider');

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MockPaymentProvider must not be used in production');
    }
  }

  async charge(input: Parameters<PaymentProvider['charge']>[0]): Promise<ProviderResult> {
    if (input.simulate === 'FAIL') return { ok: false, reason: 'Payment was declined (simulated).' };
    this.logger.log(`Mock charge ${input.amount} paise for ${input.reference}`);
    return { ok: true, providerRef: `mock_pay_${randomUUID()}` };
  }

  async refund(input: Parameters<PaymentProvider['refund']>[0]): Promise<ProviderResult> {
    this.logger.log(`Mock refund ${input.amount} paise of ${input.providerRef}`);
    return { ok: true, providerRef: `mock_ref_${randomUUID()}` };
  }
}
