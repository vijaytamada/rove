export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

export type KycOutcome = {
  providerRef: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string;
};

/** A provider's later answer, read from its webhook. Only the reference and the result: never identity details. */
export type KycWebhookResult = {
  providerRef: string;
  status: 'VERIFIED' | 'REJECTED';
  rejectionReason?: string;
};

/** Thrown by `parseWebhook` when the message is not really from the provider (bad signature) or cannot be read. */
export class KycWebhookError extends Error {
  constructor(
    readonly reason: 'BAD_SIGNATURE' | 'BAD_PAYLOAD',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Identity verification. The provider returns an outcome only; no identity numbers are kept on our side.
 * A real provider runs a hosted check and finishes through a webhook, so `start` may return PENDING and the answer
 * arrives later through `parseWebhook`. Adding a vendor means one class that implements this interface (including
 * the redirect link to its hosted check, which the clients will open); nothing in the business code changes.
 */
export interface KycProvider {
  readonly name: string;
  start(input: { userId: string; fullName: string }): Promise<KycOutcome>;
  /**
   * Checks the webhook's signature against the exact bytes received and reads the answer. Throws `KycWebhookError`
   * for a forged or unreadable message. Returns null for a valid message that is not a final answer (ignored).
   */
  parseWebhook(input: { rawBody: Buffer | undefined; headers: Record<string, string | string[] | undefined> }): KycWebhookResult | null;
}
