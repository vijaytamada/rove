import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BatteryMedium, Gauge, MapPin, Route } from "lucide-react";
import { StatusChip } from "@/components/app/StatusChip";
import { getVehicle } from "@/lib/api";
import { getCurrentUser } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { BookingPanel } from "./BookingPanel";

export const dynamic = "force-dynamic";

const DURATIONS = [1, 2, 3, 4, 6, 8, 12, 24];
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const detail = isUuid(vehicleId) ? await getVehicle(vehicleId) : null;
  return { title: detail ? `${detail.vehicle.model.brand} ${detail.vehicle.model.name}` : "Scooter" };
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ hours?: string; start?: string }>;
}) {
  const { vehicleId } = await params;
  if (!isUuid(vehicleId)) notFound();
  const [detail, user, query] = await Promise.all([getVehicle(vehicleId), getCurrentUser(), searchParams]);
  if (!detail) notFound();
  const { vehicle, station } = detail;
  const { model, pricing } = vehicle;

  const hours = DURATIONS.includes(Number(query.hours)) ? Number(query.hours) : 2;
  const start = query.start && LOCAL_TIME.test(query.start) ? query.start : "";
  const returnTo = `/book/${vehicleId}?hours=${hours}${start ? `&start=${encodeURIComponent(start)}` : ""}`;
  const bookable = vehicle.status === "AVAILABLE" && pricing !== null;
  // Only customers book; staff look at the scooter but get no booking form.
  const canBook = !user || user.role === "CUSTOMER";

  return (
    <div className="pb-36 md:pb-0">
      <Link
        href={`/stations/${station.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" /> {station.name}
      </Link>

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1fr_28rem] lg:gap-10">
        <section>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {model.brand} {model.name}
            </h1>
            <StatusChip tone={vehicle.status === "AVAILABLE" ? "success" : "muted"}>
              {vehicle.status === "AVAILABLE" ? "Available" : "Not available"}
            </StatusChip>
          </div>
          <p className="mt-1 text-ink-muted">Scooter {vehicle.code}</p>
          <p className="mt-3 flex items-start gap-2 text-ink-muted">
            <MapPin size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            {station.name}, {station.address}
          </p>

          <dl className="mt-6 grid grid-cols-3 gap-4 rounded-card border border-line bg-surface p-5 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-ink-muted">
                <BatteryMedium size={16} strokeWidth={1.75} aria-hidden="true" />
                Battery
              </dt>
              <dd className="mt-1 text-base font-medium">{vehicle.batteryPercent === null ? "–" : `${vehicle.batteryPercent}%`}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-ink-muted">
                <Route size={16} strokeWidth={1.75} aria-hidden="true" />
                Range
              </dt>
              <dd className="mt-1 text-base font-medium">{model.rangeKm} km</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-ink-muted">
                <Gauge size={16} strokeWidth={1.75} aria-hidden="true" />
                Top speed
              </dt>
              <dd className="mt-1 text-base font-medium">{model.topSpeedKmh} km/h</dd>
            </div>
          </dl>

          {pricing && (
            <div className="mt-4 rounded-card border border-line bg-surface p-5">
              <h2 className="text-base font-semibold tracking-tight">Rates and rules</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                <li>
                  <span className="font-medium text-ink">{formatMoney(pricing.hourlyRateAmount)} per hour</span>
                  {pricing.dailyRateAmount !== null && <>, never more than {formatMoney(pricing.dailyRateAmount)} for a day</>}
                </li>
                <li>
                  {pricing.includedKmPerHour} km included every hour, then {formatMoney(pricing.extraKmRateAmount)} per extra km
                </li>
                <li>
                  Return late and pay {formatMoney(pricing.lateFeePerHourAmount)} for each extra hour, after {pricing.graceMinutes} minutes
                  of grace
                </li>
                <li>{formatMoney(pricing.depositAmount)} deposit, refunded after you return the scooter in good shape</li>
              </ul>
            </div>
          )}
        </section>

        <div>
          {!canBook ? (
            <p className="rounded-card border border-line bg-surface p-5 text-sm text-ink-muted">
              Bookings are for customer accounts. Sign in as a customer to book this scooter.
            </p>
          ) : !bookable ? (
            <p className="rounded-card border border-line bg-surface p-5 text-sm text-ink-muted">
              {pricing === null
                ? "This scooter can't be booked yet."
                : "This scooter isn't available right now."}{" "}
              <Link href={`/stations/${station.id}`} className="font-medium text-ink underline">
                See other scooters at {station.name}
              </Link>
            </p>
          ) : (
            <BookingPanel
              vehicleId={vehicle.id}
              station={station}
              signedIn={user !== null}
              returnTo={returnTo}
              initialHours={hours}
              initialStart={start}
            />
          )}
        </div>
      </div>
    </div>
  );
}
