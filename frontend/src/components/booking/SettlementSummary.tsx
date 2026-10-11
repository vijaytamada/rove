import { formatMoney } from "@/lib/format";
import type { SettlementView } from "@/lib/types";

const TYPE_LABEL = { EXTRA_KM: "Extra distance", LATE_FEE: "Late return", DAMAGE: "Damage" } as const;

/** What the result of the bill says, from the customer's or the station's point of view. */
function outcome(s: SettlementView, audience: "customer" | "staff"): { label: string; hint?: string; amount: number | null; tone: "good" | "owed" | "plain" } {
  const you = audience === "customer";
  switch (s.status) {
    case "REFUNDED":
      return { label: you ? "Refunded to you" : "Refunded to the customer", amount: s.refundAmount, tone: "good" };
    case "REFUND_PENDING":
      return {
        label: you ? "Your refund is on its way" : "Refund not sent yet",
        hint: you ? "It will reach you shortly." : "The refund did not go through. Try it again.",
        amount: s.refundAmount,
        tone: "plain",
      };
    case "OUTSTANDING":
      return {
        label: you ? "You owe" : "The customer owes",
        hint: you ? "The charges are more than your deposit. Pay the difference to book again." : "The charges are more than the deposit.",
        amount: s.outstandingAmount,
        tone: "owed",
      };
    case "CLEARED":
      return { label: you ? "You paid" : "Paid by the customer", amount: s.outstandingAmount, tone: "good" };
    case "NO_ACTION":
      return {
        label: "Nothing to refund",
        hint: s.totalCharges > 0 ? "The charges used the whole deposit." : undefined,
        amount: null,
        tone: "plain",
      };
  }
}

/** The final bill of a ride. Shows backend amounts only; nothing is worked out here. */
export function SettlementSummary({ settlement: s, audience }: { settlement: SettlementView; audience: "customer" | "staff" }) {
  const result = outcome(s, audience);
  return (
    <dl className="space-y-3 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-ink-muted">Deposit paid</dt>
        <dd className="font-medium">{formatMoney(s.depositHeld)}</dd>
      </div>
      {s.lineItems.length === 0 ? (
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-muted">Charges</dt>
          <dd className="font-medium">None</dd>
        </div>
      ) : (
        s.lineItems.map((l, i) => (
          <div key={`${l.type}-${i}`} className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-muted">
              {TYPE_LABEL[l.type]}
              <span className="block text-xs text-ink-faint">
                {l.description}
                {l.quantity > 1 ? ` · ${l.quantity} × ${formatMoney(l.unitAmount)}` : ""}
              </span>
            </dt>
            <dd className="font-medium">− {formatMoney(l.amount)}</dd>
          </div>
        ))
      )}
      <div
        className={`flex items-baseline justify-between gap-4 border-t border-line pt-3 ${
          result.tone === "good" ? "text-accent-ink" : result.tone === "owed" ? "text-danger" : ""
        }`}
      >
        <dt className="font-medium">
          {result.label}
          {result.hint && <span className="block text-xs font-normal text-ink-muted">{result.hint}</span>}
        </dt>
        {result.amount !== null && <dd className="text-xl font-semibold tracking-tight">{formatMoney(result.amount)}</dd>}
      </div>
    </dl>
  );
}
