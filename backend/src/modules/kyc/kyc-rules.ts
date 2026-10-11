// When an identity check may start again, and how a provider's answer changes a record. Pure: no database, no framework.
import type { KycStatus } from '../../generated/prisma/client.js';

export const KYC_RULES = {
  /** Tries a customer gets in total (a rejected or abandoned check can be started again until they are used up). */
  MAX_ATTEMPTS: 3,
  /** A check still waiting for the provider this long may be started again (the provider never called back). */
  PENDING_RESTART_MINUTES: 15,
} as const;

export interface KycState {
  status: KycStatus;
  attempts: number;
  updatedAt: Date;
}

export type StartDecision =
  | { action: 'ALREADY_VERIFIED' }
  | { action: 'ALREADY_PENDING' }
  | { action: 'START'; attempts: number }
  | { action: 'REFUSE' };

/** What starting a check does for a customer in this state. `null` = never started. */
export function decideStart(current: KycState | null, now: Date): StartDecision {
  if (!current) return { action: 'START', attempts: 1 };
  if (current.status === 'VERIFIED') return { action: 'ALREADY_VERIFIED' };
  if (current.status === 'PENDING') {
    const waited = now.getTime() - current.updatedAt.getTime();
    if (waited < KYC_RULES.PENDING_RESTART_MINUTES * 60_000) return { action: 'ALREADY_PENDING' };
  }
  if (current.attempts >= KYC_RULES.MAX_ATTEMPTS) return { action: 'REFUSE' };
  return { action: 'START', attempts: current.attempts + 1 };
}

export const attemptsLeft = (attempts: number): number => Math.max(0, KYC_RULES.MAX_ATTEMPTS - attempts);

/**
 * Whether a provider's later answer (a webhook) changes a record. Only a check that is still waiting can change: a
 * verified customer is never un-verified by a late message, and a repeat of the same answer does nothing.
 */
export function acceptsOutcome(current: KycStatus, outcome: 'VERIFIED' | 'REJECTED' | 'PENDING'): boolean {
  return current === 'PENDING' && outcome !== 'PENDING';
}
