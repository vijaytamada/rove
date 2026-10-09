import type { Settlement, SettlementLineItem } from '../../generated/prisma/client.js';

export type SettlementRow = Settlement & { lineItems: SettlementLineItem[] };

export const SETTLEMENT_INCLUDE = { lineItems: { orderBy: { type: 'asc' as const } } } as const;

export interface SettlementView {
  id: string;
  status: Settlement['status'];
  /** The deposit the customer paid up front. */
  depositHeld: number;
  /** Extra km, late fee and damage, taken from the deposit. */
  totalCharges: number;
  /** What goes back (or went back) to the customer. */
  refundAmount: number;
  /** What the customer still owes (until it is paid, then it is the amount that was paid). */
  outstandingAmount: number;
  lineItems: { type: SettlementLineItem['type']; description: string; quantity: number; unitAmount: number; amount: number }[];
  settledAt: Date | null;
  clearedAt: Date | null;
  /** The customer can pay it now. */
  payable: boolean;
}

const ORDER = { EXTRA_KM: 0, LATE_FEE: 1, DAMAGE: 2 } as const;

export const toSettlementView = (s: SettlementRow): SettlementView => ({
  id: s.id,
  status: s.status,
  depositHeld: s.depositHeld,
  totalCharges: s.totalCharges,
  refundAmount: s.refundAmount,
  outstandingAmount: s.outstandingAmount,
  lineItems: [...s.lineItems]
    .sort((a, b) => ORDER[a.type] - ORDER[b.type])
    .map((l) => ({ type: l.type, description: l.description, quantity: l.quantity, unitAmount: l.unitAmount, amount: l.amount })),
  settledAt: s.settledAt,
  clearedAt: s.clearedAt,
  payable: s.status === 'OUTSTANDING',
});
