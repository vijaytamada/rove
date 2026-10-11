export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ProviderResult = { ok: true; providerRef: string } | { ok: false; reason: string };

/**
 * Moves money. Business modules decide what to charge or refund and when; the provider only talks to the gateway.
 * Amounts are integer paise. Calls with the same `idempotencyKey` must not move money twice.
 */
export interface PaymentProvider {
  /** Stored on every payment so we know which gateway handled it. */
  readonly name: string;
  charge(input: {
    amount: number;
    /** Our own reference (the booking code), shown on the gateway side. */
    reference: string;
    idempotencyKey: string;
    /** Honored by the mock only, so tests and demos can see a failed payment. */
    simulate?: 'FAIL';
  }): Promise<ProviderResult>;
  refund(input: { providerRef: string; amount: number; idempotencyKey: string }): Promise<ProviderResult>;
}
