import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyHmacSha256Hex } from '../../common/webhook-signature.js';
import type { Env } from '../../config/env.js';
import { KycWebhookError, type KycOutcome, type KycProvider, type KycWebhookResult } from './kyc.provider.js';

/** Header the mock reads its signature from (a real provider has its own header name). */
export const MOCK_KYC_SIGNATURE_HEADER = 'x-kyc-signature';

/**
 * Development-only provider. A customer whose name contains REJECT is rejected and one whose name contains PENDING
 * stays pending until a signed webhook answers (so every state can be tried by hand); everyone else is verified at once.
 * Its webhook is `{ providerRef, status, rejectionReason? }` as JSON, signed with HMAC-SHA256 using KYC_WEBHOOK_SECRET.
 */
@Injectable()
export class MockKycProvider implements KycProvider {
  readonly name = 'mock';
  private readonly secret: string;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MockKycProvider must not be used in production');
    }
    this.secret = config.get('KYC_WEBHOOK_SECRET', { infer: true });
  }

  async start(input: { userId: string; fullName: string }): Promise<KycOutcome> {
    const providerRef = `mock_kyc_${randomUUID()}`;
    const name = input.fullName.toUpperCase();
    if (name.includes('REJECT')) {
      return { providerRef, status: 'REJECTED', rejectionReason: 'We could not match your details (test).' };
    }
    if (name.includes('PENDING')) return { providerRef, status: 'PENDING' };
    return { providerRef, status: 'VERIFIED' };
  }

  parseWebhook(input: { rawBody: Buffer | undefined; headers: Record<string, string | string[] | undefined> }): KycWebhookResult | null {
    const header = input.headers[MOCK_KYC_SIGNATURE_HEADER];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!verifyHmacSha256Hex(input.rawBody, signature, this.secret)) {
      throw new KycWebhookError('BAD_SIGNATURE', 'The signature does not match.');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(input.rawBody!.toString('utf8'));
    } catch {
      throw new KycWebhookError('BAD_PAYLOAD', 'The body is not JSON.');
    }
    const { providerRef, status, rejectionReason } = (payload ?? {}) as Record<string, unknown>;
    if (typeof providerRef !== 'string' || providerRef.length === 0 || providerRef.length > 200) {
      throw new KycWebhookError('BAD_PAYLOAD', 'providerRef is missing.');
    }
    if (status === 'PENDING') return null;
    if (status !== 'VERIFIED' && status !== 'REJECTED') throw new KycWebhookError('BAD_PAYLOAD', 'status is not recognised.');
    return {
      providerRef,
      status,
      ...(typeof rejectionReason === 'string' ? { rejectionReason: rejectionReason.slice(0, 200) } : {}),
    };
  }
}
