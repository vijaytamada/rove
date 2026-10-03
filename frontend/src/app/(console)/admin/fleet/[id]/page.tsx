import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { retireVehicle, updateVehicle } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, SelectField } from "@/components/admin/Fields";
import { ErrorBanner, PageHeader, Panel, RowButton, VehicleStatusChip } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { apiGet, apiGetAll } from "@/lib/server-api";
import type { StationView, VehicleManageView } from "@/lib/types";

export const metadata = { title: "Edit scooter" };
export const dynamic = "force-dynamic";

export default async function EditVehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("/admin/fleet", "CITY_MANAGER", "SUPER_ADMIN");
  const { id } = await params;
  const { error } = await searchParams;
  const vehicle = await apiGet<VehicleManageView>(`/manage/vehicles/${id}`).catch(() => null);
  if (!vehicle) notFound();
  const stations = await apiGetAll<StationView>("/manage/stations");
  const busy = vehicle.status === "RESERVED" || vehicle.status === "IN_RIDE";

  return (
    <>
      <Link href="/admin/fleet" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Fleet
      </Link>
      <PageHeader
        title={vehicle.code}
        description={`${vehicle.model.brand} ${vehicle.model.name}`}
        action={<VehicleStatusChip status={vehicle.status} />}
      />
      <ErrorBanner message={error} />

      {busy ? (
        <p className="max-w-xl rounded-control bg-canvas px-4 py-3 text-sm text-ink-muted">
          This scooter is part of a booking or ride, so it can&apos;t be edited right now.
        </p>
      ) : (
        <div className="grid max-w-3xl gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <ActionForm action={updateVehicle.bind(null, vehicle.id)} submitLabel="Save changes">
              <SelectField
                label="Station"
                name="stationId"
                defaultValue={vehicle.station?.id}
                options={stations.map((s) => ({ value: s.id, label: s.name }))}
                hint="Moving a scooter to another station you manage is allowed."
              />
              <Field label="Registration number" name="registrationNumber" defaultValue={vehicle.registrationNumber ?? ""} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Battery %" name="batteryPercent" type="number" min={0} max={100} defaultValue={vehicle.batteryPercent ?? ""} />
                <Field label="Odometer (km)" name="odometerKm" type="number" min={0} step="any" defaultValue={vehicle.odometerKm} />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Retire scooter" className="self-start">
            <p className="mb-4 text-sm text-ink-muted">
              Removes it from the fleet and from customer listings. This can&apos;t be undone here.
            </p>
            <RowButton action={retireVehicle.bind(null, vehicle.id)} tone="danger">
              Retire this scooter
            </RowButton>
          </Panel>
        </div>
      )}
    </>
  );
}
