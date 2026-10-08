import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { BookingStatusChip } from "@/components/booking/BookingStatusChip";
import { PriceBreakdown } from "@/components/booking/PriceBreakdown";
import { SettlementSummary } from "@/components/booking/SettlementSummary";
import { requireRole } from "@/lib/dal";
import { formatDateTime, formatMoney, formatRange } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { apiGetMaybe } from "@/lib/server-api";
import type { BookingView } from "@/lib/types";
import { CancelButton } from "./CancelButton";

export const metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

interface Step {
  label: string;
  at: string | null;
}

/** What happened, in order, from the timestamps the backend keeps. */
function timeline(b: BookingView): Step[] {
  const steps: Step[] = [{ label: "Booked", at: b.createdAt }];
  if (b.confirmedAt) steps.push({ label: "Paid and confirmed", at: b.confirmedAt });
  if (b.status === "EXPIRED") steps.push({ label: "Hold expired, nothing was charged", at: null });
  if (b.rental) steps.push({ label: "Scooter picked up", at: b.rental.startedAt });
  if (b.rental?.endedAt) steps.push({ label: "Scooter returned", at: b.rental.endedAt });
  if (b.status === "NO_SHOW") steps.push({ label: "Marked as a no-show", at: null });
  if (b.cancelledAt) steps.push({ label: "Cancelled", at: b.cancelledAt });
  if (b.refundedAmount > 0) steps.push({ label: `${formatMoney(b.refundedAmount)} refunded`, at: null });
  if (b.settlement?.clearedAt) steps.push({ label: `${formatMoney(b.settlement.outstandingAmount)} paid`, at: b.settlement.clearedAt });
  return steps;
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmed?: string; cancelled?: string; paid?: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireRole(`/bookings/${id}`, "CUSTOMER");
  const [booking, query] = await Promise.all([apiGetMaybe<BookingView>(`/bookings/${id}`), searchParams]);
  if (!booking) notFound();

  const tz = booking.station.timezone;
  const { model } = booking.vehicle;
  const justConfirmed = query.confirmed === "1" && booking.status === "CONFIRMED";
  const justCancelled = query.cancelled === "1" && booking.status === "CANCELLED";
  const settlement = booking.settlement;
  const justPaid = query.paid === "1" && settlement?.status === "CLEARED";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/bookings" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> My bookings
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {model.brand} {model.name}
        </h1>
        <BookingStatusChip status={booking.status} owing={settlement?.status === "OUTSTANDING"} />
      </div>
      <p className="mt-1 text-ink-muted">
        Scooter {booking.vehicle.code} · Booking {booking.code}
      </p>

      {justConfirmed && (
        <p role="status" className="mt-6 rounded-control bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Booking confirmed. Show your booking code and PIN at the station to pick up the scooter.
        </p>
      )}
      {justCancelled && (
        <p role="status" className="mt-6 rounded-control bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Booking cancelled.
          {booking.refundedAmount > 0 && ` ${formatMoney(booking.refundedAmount)} is on its way back to you.`}
        </p>
      )}

      {justPaid && (
        <p role="status" className="mt-6 rounded-control bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Paid. Thank you. You can book again.
        </p>
      )}
      {settlement?.status === "OUTSTANDING" && (
        <p role="alert" className="mt-6 rounded-control bg-red-50 px-4 py-3 text-sm text-red-700">
          You owe {formatMoney(settlement.outstandingAmount)} for this ride. Pay it to book again.
        </p>
      )}

      {booking.status === "IN_RIDE" && (
        <p role="status" className="mt-6 rounded-control bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Your ride is in progress. Bring the scooter back to any station in {booking.station.cityName} by{" "}
          {formatDateTime(booking.endAt, tz)} to avoid late charges.
        </p>
      )}
      {(booking.status === "RETURNED" || booking.status === "SETTLED") && booking.rental && (
        <p role="status" className="mt-6 rounded-control bg-canvas px-4 py-3 text-sm text-ink-muted">
          Returned{booking.rental.returnStationName ? ` to ${booking.rental.returnStationName}` : ""}
          {booking.rental.distanceKm !== null ? ` after ${booking.rental.distanceKm} km` : ""}.
          {settlement?.status === "REFUND_PENDING" && " Your refund is on its way."}
          {settlement?.status === "REFUNDED" && ` ${formatMoney(settlement.refundAmount)} of your deposit was refunded.`}
        </p>
      )}
      {booking.status === "NO_SHOW" && (
        <p role="status" className="mt-6 rounded-control bg-canvas px-4 py-3 text-sm text-ink-muted">
          You didn&apos;t pick up the scooter, so the booking was closed. Your deposit was refunded; the rental charge is kept.
        </p>
      )}

      {booking.pin && (
        <section aria-label="Pickup details" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line">
          <div className="bg-surface p-5">
            <p className="text-sm text-ink-muted">Booking code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-wider">{booking.code}</p>
          </div>
          <div className="bg-surface p-5">
            <p className="text-sm text-ink-muted">Pickup PIN</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.3em]">{booking.pin}</p>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-tight">Pickup</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Clock size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <span>{formatRange(booking.startAt, booking.endAt, tz)}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <span>
                <span className="block font-medium">{booking.station.name}</span>
                <span className="block text-ink-muted">{booking.station.address}</span>
                <span className="block text-ink-muted">
                  {booking.station.opensAt && booking.station.closesAt
                    ? `Open ${booking.station.opensAt} – ${booking.station.closesAt}`
                    : "Open 24 hours"}
                </span>
              </span>
            </li>
          </ul>
        </section>

        <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold tracking-tight">Price</h2>
          <PriceBreakdown
            rentalAmount={booking.rentalAmount}
            depositAmount={booking.depositAmount}
            totalAmount={booking.totalAmount}
            hours={booking.hours}
            refundedAmount={booking.refundedAmount}
          />
        </section>

        {settlement && (
          <section className="rounded-card border border-line bg-surface p-5 sm:p-6 md:col-span-2">
            <h2 className="mb-4 text-base font-semibold tracking-tight">Final bill</h2>
            <SettlementSummary settlement={settlement} audience="customer" />
          </section>
        )}

        <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-tight">Rates you agreed to</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            <li>{booking.includedKm} km included, then {formatMoney(booking.pricing.extraKmRateAmount)} per extra km</li>
            <li>
              Late return: {formatMoney(booking.pricing.lateFeePerHourAmount)} per extra hour after{" "}
              {booking.pricing.graceMinutes} minutes
            </li>
            <li>The deposit comes back when you return the scooter in good shape</li>
          </ul>
        </section>

        <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-tight">Timeline</h2>
          <ol className="mt-4 space-y-4">
            {timeline(booking).map((s, i) => (
              <li key={`${s.label}-${i}`} className="flex gap-3 text-sm">
                <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                <span>
                  <span className="block font-medium">{s.label}</span>
                  {s.at && <span className="block text-ink-muted">{formatDateTime(s.at, tz)}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {(booking.status === "PENDING_PAYMENT" || booking.cancellation.allowed || settlement?.payable) && (
        <div className="mt-8 grid gap-3 sm:max-w-md">
          {settlement?.payable && (
            <Link
              href={`/bookings/${booking.id}/settle`}
              className="flex h-12 items-center justify-center rounded-full bg-ink text-base font-medium text-white transition-colors hover:bg-ink/90"
            >
              Pay {formatMoney(settlement.outstandingAmount)}
            </Link>
          )}
          {booking.status === "PENDING_PAYMENT" && (
            <Link
              href={`/bookings/${booking.id}/pay`}
              className="flex h-12 items-center justify-center rounded-full bg-ink text-base font-medium text-white transition-colors hover:bg-ink/90"
            >
              Pay {formatMoney(booking.totalAmount)}
            </Link>
          )}
          {booking.cancellation.allowed && <CancelButton booking={booking} />}
        </div>
      )}
    </div>
  );
}
