import { formatMoney } from "@/lib/format";

interface Props {
  rentalAmount: number;
  depositAmount: number;
  totalAmount: number;
  hours: number;
  /** Money already returned (cancelled bookings). */
  refundedAmount?: number;
}

/** Rental, the refundable deposit as its own line, and the total. Shows backend amounts only. */
export function PriceBreakdown({ rentalAmount, depositAmount, totalAmount, hours, refundedAmount = 0 }: Props) {
  return (
    <dl className="space-y-3 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-ink-muted">Rental · {hours} {hours === 1 ? "hour" : "hours"}</dt>
        <dd className="font-medium">{formatMoney(rentalAmount)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-ink-muted">
          Refundable deposit
          <span className="block text-xs text-ink-faint">Returned after you bring the scooter back</span>
        </dt>
        <dd className="font-medium">{formatMoney(depositAmount)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <dt className="font-medium">Total</dt>
        <dd className="text-xl font-semibold tracking-tight">{formatMoney(totalAmount)}</dd>
      </div>
      {refundedAmount > 0 && (
        <div className="flex items-baseline justify-between gap-4 text-accent-ink">
          <dt>Refunded to you</dt>
          <dd className="font-medium">{formatMoney(refundedAmount)}</dd>
        </div>
      )}
    </dl>
  );
}
