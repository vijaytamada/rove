import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updateStation } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, SelectField } from "@/components/admin/Fields";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { apiGetAll } from "@/lib/server-api";
import type { StationView } from "@/lib/types";

export const metadata = { title: "Edit station" };
export const dynamic = "force-dynamic";

export default async function EditStationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("/admin/stations", "CITY_MANAGER", "SUPER_ADMIN");
  const { id } = await params;
  const station = (await apiGetAll<StationView>("/manage/stations")).find((s) => s.id === id);
  if (!station) notFound();

  return (
    <>
      <Link href="/admin/stations" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Stations
      </Link>
      <PageHeader title={station.name} description="The city of a station can't be changed." />
      <Panel className="max-w-xl">
        <ActionForm action={updateStation.bind(null, station.id)} submitLabel="Save changes">
          <Field label="Name" name="name" defaultValue={station.name} required />
          <Field label="Address" name="address" defaultValue={station.address} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" name="latitude" type="number" step="any" defaultValue={station.latitude} required />
            <Field label="Longitude" name="longitude" type="number" step="any" defaultValue={station.longitude} required />
          </div>
          <Field label="Capacity" name="capacity" type="number" min={1} defaultValue={station.capacity} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens" name="opensAt" type="time" defaultValue={station.opensAt ?? ""} />
            <Field label="Closes" name="closesAt" type="time" defaultValue={station.closesAt ?? ""} />
          </div>
          <SelectField
            label="Status"
            name="status"
            defaultValue={station.status}
            options={[
              { value: "ACTIVE", label: "Open (visible to customers)" },
              { value: "INACTIVE", label: "Closed (hidden from customers)" },
            ]}
          />
        </ActionForm>
      </Panel>
    </>
  );
}
