import { BatteryMedium, Gauge, Route } from "lucide-react";
import { StatusChip } from "@/components/app/StatusChip";
import type { VehiclePublicView } from "@/lib/types";

export function ScooterCard({ vehicle }: { vehicle: VehiclePublicView }) {
  const { model } = vehicle;
  const battery = vehicle.batteryPercent;
  return (
    <article className="rounded-card border border-line bg-surface p-5">
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
    </article>
  );
}
