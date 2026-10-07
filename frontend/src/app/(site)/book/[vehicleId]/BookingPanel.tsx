"use client";

import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { createBooking, getQuote, type QuoteResult } from "@/app/actions/booking";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { PriceBreakdown } from "@/components/booking/PriceBreakdown";
import { StickyCta } from "@/components/booking/StickyCta";
import { formatDateTime, formatMoney, toLocalInput } from "@/lib/format";
import type { FormState } from "@/lib/form";
import type { StationSummary } from "@/lib/types";
import { useNow } from "@/lib/use-now";

const DURATIONS = [1, 2, 3, 4, 6, 8, 12, 24];

interface Props {
  vehicleId: string;
  station: StationSummary;
  signedIn: boolean;
  /** Where to come back to after signing in. */
  returnTo: string;
  initialHours: number;
  /** "YYYY-MM-DDTHH:mm" on the station's clock, or "" to start now. */
  initialStart: string;
}

/** Start time, duration and the live price. Every amount comes from the backend quote. */
export function BookingPanel({ vehicleId, station, signedIn, returnTo, initialHours, initialStart }: Props) {
  const tz = station.timezone;
  const [mode, setMode] = useState<"now" | "later">(initialStart ? "later" : "now");
  const [startLocal, setStartLocal] = useState(initialStart);
  const [hours, setHours] = useState(initialHours);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [state, formAction] = useActionState<FormState, FormData>(createBooking, {});

  // The earliest start is five minutes from now on the station's clock (unknown until the browser has a clock).
  const now = useNow(30_000);
  const minStart = now === null ? undefined : toLocalInput(new Date(now + 5 * 60_000), tz);

  const effectiveStart = mode === "later" ? startLocal : "";

  useEffect(() => {
    if (mode === "later" && !startLocal) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const next = await getQuote(vehicleId, effectiveStart, tz, hours);
      if (!stale) setResult(next);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [vehicleId, effectiveStart, tz, hours, mode, startLocal]);

  const waitingForTime = mode === "later" && !startLocal;
  const quote = result?.ok && !waitingForTime ? result.quote : null;
  const error = result && !result.ok && !waitingForTime ? result.error : null;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="hours" value={hours} />
      <input type="hidden" name="startLocal" value={effectiveStart} />
      <input type="hidden" name="timeZone" value={tz} />

      <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight">When do you start?</h2>
        <div role="radiogroup" aria-label="Start time" className="mt-4 grid grid-cols-2 gap-2">
          {(["now", "later"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`h-11 rounded-full border text-sm font-medium transition-colors ${
                mode === m ? "border-ink bg-ink text-white" : "border-line bg-surface hover:bg-canvas"
              }`}
            >
              {m === "now" ? "Start now" : "Pick a time"}
            </button>
          ))}
        </div>
        {mode === "later" && (
          <div className="mt-4">
            <label htmlFor="startLocal" className="mb-1.5 block text-sm font-medium">
              Pickup time
            </label>
            <input
              id="startLocal"
              type="datetime-local"
              value={startLocal}
              min={minStart}
              onChange={(e) => setStartLocal(e.target.value)}
              className="h-12 w-full rounded-control border border-line bg-surface px-4 text-base outline-none focus:border-ink"
            />
            <p className="mt-1.5 text-sm text-ink-muted">Up to 7 days ahead. Times are in {station.cityName} time.</p>
          </div>
        )}

        <h2 className="mt-8 text-base font-semibold tracking-tight">How long?</h2>
        <div role="radiogroup" aria-label="Duration" className="mt-4 flex flex-wrap gap-2">
          {DURATIONS.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={hours === h}
              onClick={() => setHours(h)}
              className={`h-11 min-w-16 rounded-full border px-4 text-sm font-medium transition-colors ${
                hours === h ? "border-ink bg-ink text-white" : "border-line bg-surface hover:bg-canvas"
              }`}
            >
              {h === 24 ? "1 day" : `${h} ${h === 1 ? "hour" : "hours"}`}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 sm:p-6" aria-live="polite">
        <h2 className="text-base font-semibold tracking-tight">Your price</h2>
        {waitingForTime ? (
          <p className="mt-4 text-sm text-ink-muted">Choose a pickup time to see the price.</p>
        ) : error ? (
          <p role="alert" className="mt-4 rounded-control bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : quote ? (
          <div className="mt-4 space-y-5">
            <PriceBreakdown
              rentalAmount={quote.rentalAmount}
              depositAmount={quote.depositAmount}
              totalAmount={quote.totalAmount}
              hours={quote.hours}
            />
            <ul className="space-y-1.5 text-sm text-ink-muted">
              <li className="flex items-center gap-2">
                <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
                {formatDateTime(quote.startAt, tz)} – {formatDateTime(quote.endAt, tz)}
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
                Pick up at {station.name}
              </li>
              <li>Includes {quote.includedKm} km. We hold the scooter for {quote.holdMinutes} minutes while you pay.</li>
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">Checking price…</p>
        )}
      </section>

      <StickyCta>
        <div className="space-y-3">
          <FormMessage state={state} />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-ink-muted">Total</p>
              <p className="text-xl font-semibold tracking-tight">{quote ? formatMoney(quote.totalAmount) : "–"}</p>
            </div>
            <div className="w-48 sm:w-56">
              {signedIn ? (
                <SubmitButton disabled={!quote}>Continue</SubmitButton>
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(returnTo)}`}
                  className="flex h-12 w-full items-center justify-center rounded-full bg-ink text-base font-medium text-white transition-colors hover:bg-ink/90"
                >
                  Sign in to book
                </Link>
              )}
            </div>
          </div>
        </div>
      </StickyCta>
    </form>
  );
}
