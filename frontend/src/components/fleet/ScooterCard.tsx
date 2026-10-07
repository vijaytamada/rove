import Link from "next/link";
import { BatteryMedium, Gauge, Route } from "lucide-react";
import { StatusChip } from "@/components/app/StatusChip";
import { formatMoney } from "@/lib/format";
import type { VehicleBrowseView } from "@/lib/types";

export function ScooterCard({ vehicle }: { vehicle: VehicleBrowseView }) {
  const { model, pricing } = vehicle;
  const battery = vehicle.batteryPercent;
  return (
    <article className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            {model.brand} {model.name}
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">Scooter {vehicle.code}</p>
        </div>
        <StatusChip tone="success">Available</StatusChip>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="flex items-center gap-1.5 text-ink-muted">
            <BatteryMedium size={16} strokeWidth={1.75} aria-hidden="true" />
            Battery
          </dt>
          <dd className="mt-1 font-medium">{battery === null ? "–" : `${battery}%`}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-ink-muted">
            <Route size={16} strokeWidth={1.75} aria-hidden="true" />
            Range
          </dt>
          <dd className="mt-1 font-medium">{model.rangeKm} km</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-ink-muted">
            <Gauge size={16} strokeWidth={1.75} aria-hidden="true" />
            Top speed
          </dt>
          <dd className="mt-1 font-medium">{model.topSpeedKmh} km/h</dd>
        </div>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        {pricing ? (
          <p>
            <span className="text-xl font-semibold tracking-tight">{formatMoney(pricing.hourlyRateAmount)}</span>
            <span className="text-sm text-ink-muted"> / hour</span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Not open for booking yet</p>
        )}
        {pricing && (
          <Link
            href={`/book/${vehicle.id}`}
            className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink/90"
          >
            Select
          </Link>
        )}
      </div>
    </article>
  );
}
