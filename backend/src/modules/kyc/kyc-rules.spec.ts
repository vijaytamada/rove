import { KYC_RULES, acceptsOutcome, attemptsLeft, decideStart, type KycState } from './kyc-rules.js';

const now = new Date('2026-10-12T10:00:00Z');
const state = (status: KycState['status'], attempts: number, minutesAgo = 0): KycState => ({
  status,
  attempts,
  updatedAt: new Date(now.getTime() - minutesAgo * 60_000),
});

describe('decideStart', () => {
  it('starts a first check', () => {
    expect(decideStart(null, now)).toEqual({ action: 'START', attempts: 1 });
  });

  it('leaves a verified customer alone', () => {
    expect(decideStart(state('VERIFIED', 1), now)).toEqual({ action: 'ALREADY_VERIFIED' });
  });

  it('does not start a second check while one is waiting for the provider', () => {
    expect(decideStart(state('PENDING', 1, 1), now)).toEqual({ action: 'ALREADY_PENDING' });
    expect(decideStart(state('PENDING', 1, KYC_RULES.PENDING_RESTART_MINUTES - 1), now)).toEqual({ action: 'ALREADY_PENDING' });
  });

  it('restarts a check the provider never answered, and counts it as a try', () => {
    expect(decideStart(state('PENDING', 1, KYC_RULES.PENDING_RESTART_MINUTES), now)).toEqual({ action: 'START', attempts: 2 });
  });

  it('lets a rejected customer try again until the tries are used up', () => {
    expect(decideStart(state('REJECTED', 1), now)).toEqual({ action: 'START', attempts: 2 });
    expect(decideStart(state('REJECTED', 2), now)).toEqual({ action: 'START', attempts: 3 });
    expect(decideStart(state('REJECTED', KYC_RULES.MAX_ATTEMPTS), now)).toEqual({ action: 'REFUSE' });
    expect(decideStart(state('PENDING', KYC_RULES.MAX_ATTEMPTS, 60), now)).toEqual({ action: 'REFUSE' });
  });

  it('an admin reset (attempts back to 0) allows a fresh run of tries', () => {
    expect(decideStart(state('REJECTED', 0), now)).toEqual({ action: 'START', attempts: 1 });
  });
});

describe('attemptsLeft', () => {
  it('counts down and never goes below zero', () => {
    expect(attemptsLeft(0)).toBe(3);
    expect(attemptsLeft(1)).toBe(2);
    expect(attemptsLeft(3)).toBe(0);
    expect(attemptsLeft(9)).toBe(0);
  });
});

describe('acceptsOutcome', () => {
  it('only a waiting check takes a final answer', () => {
    expect(acceptsOutcome('PENDING', 'VERIFIED')).toBe(true);
    expect(acceptsOutcome('PENDING', 'REJECTED')).toBe(true);
  });

  it('ignores a repeat, a late contradiction, and a still-waiting message', () => {
    expect(acceptsOutcome('VERIFIED', 'REJECTED')).toBe(false);
    expect(acceptsOutcome('VERIFIED', 'VERIFIED')).toBe(false);
    expect(acceptsOutcome('REJECTED', 'VERIFIED')).toBe(false);
    expect(acceptsOutcome('PENDING', 'PENDING')).toBe(false);
  });
});
