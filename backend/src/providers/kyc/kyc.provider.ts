export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

export type KycOutcome = {
  providerRef: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string;
};

/**
 * Identity verification. The provider returns an outcome only; no identity numbers are kept on our side.
 * The real provider (Phase 9) is a redirect flow that finishes through a webhook, so `start` may return PENDING.
 */
export interface KycProvider {
  readonly name: string;
  start(input: { userId: string }): Promise<KycOutcome>;
}
