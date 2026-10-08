import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, User } from "lucide-react";
import { Panel } from "@/components/admin/ui";
import { BookingStatusChip } from "@/components/booking/BookingStatusChip";
import { NoShowButton, PickupForm, ReturnForm } from "@/components/desk/DeskForms";
import { requireRole } from "@/lib/dal";
import { formatDateTime, formatMoney, formatRange } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { formatPhone } from "@/lib/phone";
import { apiGetMaybe } from "@/lib/server-api";
import type { DamageView, StaffBookingView } from "@/lib/types";

export const metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

const DONE: Record<string, string> = {
  pickup: "The scooter has been handed over. The ride has started.",
  return: "The scooter has been returned.",
  "no-show": "Marked as a no-show. The deposit is on its way back to the customer.",
};

const SEVERITY: Record<DamageView["severity"], string> = { MINOR: "Minor", MODERATE: "Moderate", MAJOR: "Major" };

/** What to say when there is nothing to do: the state of the booking, not the reason an action is blocked. */
function idleMessage(b: StaffBookingView): string {
  switch (b.status) {
    case "RETURNED":
    case "SETTLED":
      return "This ride is complete. The scooter is back.";
    case "NO_SHOW":
      return "This booking was marked as a no-show.";
    case "CANCELLED":
      return "This booking was cancelled.";
    case "EXPIRED":
      return "This booking expired before it was paid.";
    case "PENDING_PAYMENT":
      return "Waiting for the customer to pay.";
    default:
      return b.actions.pickup.reason ?? b.actions.return.reason ?? b.actions.noShow.reason ?? "Nothing to do for this booking.";
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export default async function DeskBooking({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireRole(`/staff/bookings/${id}`, "STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN");
  const [b, query] = await Promise.all([apiGetMaybe<StaffBookingView>(`/station/bookings/${id}`), searchParams]);
  if (!b) notFound();

  const tz = b.station.timezone;
  const { pickup, return: ret, noShow } = b.actions;
  const rental = b.rental;
  const idle = !pickup.allowed && !ret.allowed && !noShow.allowed;

  return (
    <>
      <Link href="/staff" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Station desk
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-wide sm:text-3xl">{b.code}</h1>
          <p className="mt-1 text-ink-muted">
            {b.vehicle.model.brand} {b.vehicle.model.name} · {b.vehicle.code}
          </p>
        </div>
        <BookingStatusChip status={b.status} />
      </div>

      {query.done && DONE[query.done] && (
        <p role="status" className="mb-6 rounded-control bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          {DONE[query.done]}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-6">
          {pickup.allowed && (
            <Panel title="Hand over the scooter">
              <PickupForm booking={b} />
            </Panel>
          )}
          {ret.allowed && (
            <Panel title="Take the scooter back">
              <ReturnForm booking={b} />
            </Panel>
          )}
          {noShow.allowed && (
            <Panel title="Customer didn't come">
              <p className="mb-4 text-sm text-ink-muted">
                The time to arrive has passed. Marking a no-show refunds the deposit and frees the scooter.
              </p>
              <NoShowButton booking={b} />
            </Panel>
          )}
          {idle && (
            <Panel>
              <p className="text-sm text-ink-muted">{idleMessage(b)}</p>
            </Panel>
          )}
          {!pickup.allowed && b.status === "CONFIRMED" && !idle && <p className="text-sm text-ink-muted">{pickup.reason}</p>}
          {!ret.allowed && b.status === "IN_RIDE" && <p className="text-sm text-ink-muted">{ret.reason}</p>}

          {rental && (
            <Panel title="Ride">
              <dl className="divide-y divide-line">
                <Row label="Handed over">{formatDateTime(rental.startedAt, tz)}</Row>
                <Row label="Handed over by">{rental.pickupEmployee}</Row>
                <Row label="Odometer at pickup">{rental.startOdometerKm} km</Row>
                <Row label="Battery at pickup">{rental.startBatteryPercent}%</Row>
                {rental.swapReason && <Row label="Scooter swapped because">{rental.swapReason}</Row>}
                {rental.endedAt && (
                  <>
                    <Row label="Returned">{formatDateTime(rental.endedAt, tz)}</Row>
                    <Row label="Returned to">{rental.returnStation?.name ?? "–"}</Row>
                    <Row label="Taken back by">{rental.returnEmployee ?? "–"}</Row>
                    <Row label="Odometer at return">{rental.endOdometerKm} km</Row>
                    <Row label="Distance">{rental.distanceKm} km</Row>
                    <Row label="Battery at return">{rental.endBatteryPercent}%</Row>
                  </>
                )}
              </dl>
              {rental.damages.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Damage notes</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {rental.damages.map((d) => (
                      <li key={d.id} className="rounded-control bg-canvas px-3 py-2">
                        <span className="font-medium">{d.phase === "PICKUP" ? "Already there" : "At return"}</span> · {SEVERITY[d.severity]}
                        {d.feeAmount > 0 && <> · charge {formatMoney(d.feeAmount)}</>}
                        <span className="block text-ink-muted">{d.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Customer">
            <p className="flex items-center gap-2 font-medium">
              <User size={16} className="text-ink-muted" aria-hidden="true" /> {b.customer.fullName}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{b.customer.phone ? formatPhone(b.customer.phone) : "No phone number"}</p>
          </Panel>
          <Panel title="Booking">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <Clock size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span>
                  {formatRange(b.startAt, b.endAt, tz)}
                  <span className="block text-ink-muted">
                    {b.hours} {b.hours === 1 ? "hour" : "hours"}
                    {b.status === "CONFIRMED" && <> · pickup opens {formatDateTime(b.pickupOpensAt, tz)}</>}
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span>
                  {b.station.name}
                  <span className="block text-ink-muted">{b.station.address}</span>
                </span>
              </li>
            </ul>
            <dl className="mt-4 divide-y divide-line border-t border-line">
              <Row label="Rental">{formatMoney(b.rentalAmount)}</Row>
              <Row label="Deposit">{formatMoney(b.depositAmount)}</Row>
              <Row label="Paid">{formatMoney(b.totalAmount)}</Row>
              {b.refundedAmount > 0 && <Row label="Refunded">{formatMoney(b.refundedAmount)}</Row>}
            </dl>
          </Panel>
          <Panel title="Scooter">
            <dl className="divide-y divide-line">
              <Row label="Model">
                {b.vehicle.model.brand} {b.vehicle.model.name}
              </Row>
              <Row label="Last odometer">{b.vehicle.odometerKm} km</Row>
              <Row label="Battery">{b.vehicle.batteryPercent === null ? "–" : `${b.vehicle.batteryPercent}%`}</Row>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
