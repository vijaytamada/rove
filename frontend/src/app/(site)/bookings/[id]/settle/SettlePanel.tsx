"use client";

import { useActionState } from "react";
import { paySettlement } from "@/app/actions/booking";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { SettlementSummary } from "@/components/booking/SettlementSummary";
import { StickyCta } from "@/components/booking/StickyCta";
import { formatMoney } from "@/lib/format";
import type { FormState } from "@/lib/form";
import type { BookingView, SettlementView } from "@/lib/types";

/** Demo checkout for the amount owed after a ride: the bill, one Pay button. No card details are collected. */
export function SettlePanel({ booking, next, showDemoControls }: { booking: BookingView; next?: string; showDemoControls: boolean }) {
  const settlement = booking.settlement as SettlementView;
  const [state, action] = useActionState<FormState, FormData>(paySettlement.bind(null, booking.id, next), {});
  const { model } = booking.vehicle;

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight">
          {model.brand} {model.name}
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">Ride {booking.code}</p>
        <div className="mt-5 border-t border-line pt-5">
          <SettlementSummary settlement={settlement} audience="customer" />
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight">Payment</h2>
        <p className="mt-2 text-sm text-ink-muted">This is a demo checkout. Nothing is charged and no card details are asked for.</p>
        {showDemoControls && (
          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" name="simulate" value="FAIL" className="size-4 accent-ink" />
            Make this payment fail (to see the retry)
          </label>
        )}
      </section>

      <StickyCta>
        <div className="space-y-3">
          <FormMessage state={state} />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-ink-muted">You owe</p>
              <p className="text-xl font-semibold tracking-tight">{formatMoney(settlement.outstandingAmount)}</p>
            </div>
            <div className="w-48 sm:w-56">
              <SubmitButton>Pay {formatMoney(settlement.outstandingAmount)}</SubmitButton>
            </div>
          </div>
        </div>
      </StickyCta>
    </form>
  );
}
