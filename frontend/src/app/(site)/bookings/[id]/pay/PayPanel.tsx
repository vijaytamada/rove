"use client";

import Link from "next/link";
import { Timer } from "lucide-react";
import { useActionState } from "react";
import { payBooking } from "@/app/actions/booking";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { PriceBreakdown } from "@/components/booking/PriceBreakdown";
import { StickyCta } from "@/components/booking/StickyCta";
import { formatCountdown, formatMoney, formatRange } from "@/lib/format";
import type { FormState } from "@/lib/form";
import type { BookingView } from "@/lib/types";
import { useNow } from "@/lib/use-now";

/** Demo checkout: order summary, a hold countdown and one Pay button. No card details are collected. */
export function PayPanel({ booking, showDemoControls }: { booking: BookingView; showDemoControls: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(payBooking.bind(null, booking.id), {});
  const now = useNow();

  const expiresAt = booking.holdExpiresAt;
  const expired = (now !== null && expiresAt !== null && new Date(expiresAt).getTime() <= now) || state.values?.code === "HOLD_EXPIRED";
  const { model } = booking.vehicle;

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {model.brand} {model.name}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {booking.station.name} · {formatRange(booking.startAt, booking.endAt, booking.station.timezone)}
            </p>
          </div>
          {expiresAt && !expired && (
            <p
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800"
              aria-label="Time left to pay"
            >
              <Timer size={16} aria-hidden="true" />
              <span suppressHydrationWarning>{now === null ? "--:--" : formatCountdown(expiresAt, now)}</span>
            </p>
          )}
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <PriceBreakdown
            rentalAmount={booking.rentalAmount}
            depositAmount={booking.depositAmount}
            totalAmount={booking.totalAmount}
            hours={booking.hours}
          />
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight">Payment</h2>
        <p className="mt-2 text-sm text-ink-muted">
          This is a demo checkout. Nothing is charged and no card details are asked for.
        </p>
        {showDemoControls && (
          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" name="simulate" value="FAIL" className="size-4 accent-ink" />
            Make this payment fail (to see the retry)
          </label>
        )}
      </section>

      <StickyCta>
        <div className="space-y-3">
          {expired ? (
            <div role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-700">
              Your hold on this scooter ran out.{" "}
              <Link href={`/book/${booking.vehicle.id}`} className="font-medium underline">
                Book it again
              </Link>
            </div>
          ) : (
            <FormMessage state={state} />
          )}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-ink-muted">Total</p>
              <p className="text-xl font-semibold tracking-tight">{formatMoney(booking.totalAmount)}</p>
            </div>
            <div className="w-48 sm:w-56">
              <SubmitButton disabled={expired}>Pay {formatMoney(booking.totalAmount)}</SubmitButton>
            </div>
          </div>
        </div>
      </StickyCta>
    </form>
  );
}
