import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { KycOutcome, KycProvider } from './kyc.provider.js';

/** Development-only provider: verifies everyone instantly. */
@Injectable()
export class MockKycProvider implements KycProvider {
  readonly name = 'mock';

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MockKycProvider must not be used in production');
    }
  }

  async start(): Promise<KycOutcome> {
    return { providerRef: `mock_kyc_${randomUUID()}`, status: 'VERIFIED' };
  }
}
