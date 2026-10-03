import { changeVehicleStatus } from "@/app/actions/admin";
import { VEHICLE_STATUS_LABEL } from "@/components/admin/ui";
import type { VehicleManageView, VehicleStatus } from "@/lib/types";

const MANUAL: VehicleStatus[] = ["AVAILABLE", "MAINTENANCE", "OFFLINE"];

/** Row control to change a scooter's status. Reserved/in-ride scooters are locked. */
export function StatusForm({ vehicle, page, allowed = MANUAL }: { vehicle: VehicleManageView; page: string; allowed?: VehicleStatus[] }) {
  const busy = vehicle.status === "RESERVED" || vehicle.status === "IN_RIDE";
  if (busy) return <span className="text-xs text-ink-muted">Locked while booked</span>;
  return (
    <form action={changeVehicleStatus} className="flex items-center gap-2">
      <input type="hidden" name="id" value={vehicle.id} />
      <input type="hidden" name="page" value={page} />
      <label className="sr-only" htmlFor={`status-${vehicle.id}`}>
        Status for {vehicle.code}
      </label>
      <select
        id={`status-${vehicle.id}`}
        name="status"
        defaultValue={vehicle.status}
        className="h-9 rounded-control border border-line bg-surface px-2 text-sm"
      >
        {allowed.map((s) => (
          <option key={s} value={s}>
            {VEHICLE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-canvas">
        Set
      </button>
    </form>
  );
}

