import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { StatusChip } from "@/components/app/StatusChip";
import type { StationView } from "@/lib/types";

export function hoursLabel(s: Pick<StationView, "opensAt" | "closesAt">) {
  return s.opensAt && s.closesAt ? `${s.opensAt} – ${s.closesAt}` : "Open 24 hours";
}

export function StationCard({ station }: { station: StationView }) {
  const n = station.availableVehicles;
  return (
    <Link
      href={`/stations/${station.id}`}
      className="group flex flex-col rounded-card border border-line bg-surface p-5 transition-colors hover:border-ink/30"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">{station.name}</h3>
        {n > 0 ? (
          <StatusChip tone="success">{n} available</StatusChip>
        ) : (
          <StatusChip tone="muted">None available</StatusChip>
        )}
      </div>
      <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
        <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
        {station.address}
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
        <Clock size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
        {hoursLabel(station)}
      </p>
      <span className="mt-4 text-sm font-medium text-ink group-hover:underline">View scooters</span>
    </Link>
  );
}
