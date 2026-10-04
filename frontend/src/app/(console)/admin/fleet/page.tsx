import { createVehicle } from "@/app/actions/admin";
import { StatusForm } from "@/components/admin/StatusForm";
import { ActionForm } from "@/components/admin/ActionForm";
import { AddDialog } from "@/components/admin/AddDialog";
import { Field, FormGrid, SelectField } from "@/components/admin/Fields";
import {
  EmptyRow,
  ErrorBanner,
  PageHeader,
  RowLink,
  TableWrap,
  Td,
  Th,
  VEHICLE_STATUS_LABEL,
  VehicleStatusChip,
} from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { isUuid } from "@/lib/ids";
import { apiGet, apiGetAll } from "@/lib/server-api";
import type { StationView, VehicleManageView, VehicleModelView, VehicleStatus } from "@/lib/types";

export const metadata = { title: "Fleet" };
export const dynamic = "force-dynamic";

const ALL_STATUSES: VehicleStatus[] = ["AVAILABLE", "RESERVED", "IN_RIDE", "MAINTENANCE", "OFFLINE"];

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; station?: string; status?: string }>;
}) {
  await requireRole("/admin/fleet", "CITY_MANAGER", "SUPER_ADMIN");
  const { error, station, status } = await searchParams;

  const query = new URLSearchParams();
  if (isUuid(station)) query.set("stationId", station);
  if (status && ALL_STATUSES.includes(status as VehicleStatus)) query.set("status", status);
  const qs = query.toString();

  const [vehicles, stations, models] = await Promise.all([
    apiGetAll<VehicleManageView>(`/manage/vehicles${qs ? `?${qs}` : ""}`),
    apiGetAll<StationView>("/manage/stations"),
    apiGet<VehicleModelView[]>("/manage/vehicle-models"),
  ]);
  const activeModels = models.filter((m) => m.isActive);

  return (
    <>
      <PageHeader
        title="Fleet"
        description="Scooters across your stations."
        action={
          stations.length > 0 &&
          activeModels.length > 0 && (
            <AddDialog label="Add scooter" title="Add a scooter">
              <ActionForm action={createVehicle} submitLabel="Add scooter" resetOnSuccess>
                <FormGrid>
                  <SelectField
                    label="Model"
                    name="modelId"
                    placeholder="Choose a model"
                    options={activeModels.map((m) => ({ value: m.id, label: `${m.brand} ${m.name}` }))}
                    required
                  />
                  <SelectField
                    label="Station"
                    name="stationId"
                    placeholder="Choose a station"
                    options={stations.map((s) => ({ value: s.id, label: s.name }))}
                    required
                  />
                  <Field label="Code" name="code" placeholder="BLR-012" required hint="Letters, numbers and dashes. Saved in capitals." />
                  <Field label="Registration number" name="registrationNumber" placeholder="KA01AB1234" hint="Optional." />
                  <Field label="Battery %" name="batteryPercent" type="number" min={0} max={100} placeholder="90" />
                  <Field label="Odometer (km)" name="odometerKm" type="number" min={0} step="any" placeholder="0" />
                </FormGrid>
              </ActionForm>
            </AddDialog>
          )
        }
      />
      <ErrorBanner message={error} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="station" className="mb-1.5 block text-sm font-medium">
            Station
          </label>
          <select id="station" name="station" defaultValue={isUuid(station) ? station : ""} className="h-10 min-w-44 rounded-control border border-line bg-surface px-3 text-sm">
            <option value="">All stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1.5 block text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="h-10 min-w-36 rounded-control border border-line bg-surface px-3 text-sm">
            <option value="">Any status</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {VEHICLE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-10 rounded-full bg-ink px-5 text-sm font-medium text-white hover:bg-ink/90">
          Filter
        </button>
      </form>

      <TableWrap>
        <thead>
          <tr>
            <Th>Scooter</Th>
            <Th>Station</Th>
            <Th>Battery</Th>
            <Th>Status</Th>
            <Th>Change status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {vehicles.length === 0 && <EmptyRow colSpan={6}>No scooters match.</EmptyRow>}
          {vehicles.map((v) => (
            <tr key={v.id}>
              <Td label="Scooter">
                <p className="font-medium">{v.code}</p>
                <p className="text-xs text-ink-muted">
                  {v.model.brand} {v.model.name}
                </p>
              </Td>
              <Td label="Station">{v.station?.name ?? "–"}</Td>
              <Td label="Battery">{v.batteryPercent === null ? "–" : `${v.batteryPercent}%`}</Td>
              <Td label="Status">
                <VehicleStatusChip status={v.status} />
              </Td>
              <Td label="Change status">
                <StatusForm vehicle={v} page="/admin/fleet" />
              </Td>
              <Td className="text-right">
                <RowLink href={`/admin/fleet/${v.id}`}>Edit</RowLink>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
