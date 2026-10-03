import { createStation, setStationStatus } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, SelectField } from "@/components/admin/Fields";
import { EmptyRow, ErrorBanner, PageHeader, Panel, RowButton, RowLink, TableWrap, Td, Th } from "@/components/admin/ui";
import { hoursLabel } from "@/components/fleet/StationCard";
import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";
import { apiGetAll } from "@/lib/server-api";
import type { CityView, StationView } from "@/lib/types";

export const metadata = { title: "Stations" };
export const dynamic = "force-dynamic";

export default async function StationsAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; city?: string }> }) {
  await requireRole("/admin/stations", "CITY_MANAGER", "SUPER_ADMIN");
  const { error, city } = await searchParams;
  const [cities, stations] = await Promise.all([
    apiGetAll<CityView>("/manage/cities"),
    apiGetAll<StationView>(`/manage/stations${city ? `?cityId=${encodeURIComponent(city)}` : ""}`),
  ]);
  const cityName = new Map(cities.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Stations" description="Pickup and return points." />
      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TableWrap>
            <thead>
              <tr>
                <Th>Station</Th>
                <Th>City</Th>
                <Th>Scooters</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {stations.length === 0 && <EmptyRow colSpan={6}>No stations yet.</EmptyRow>}
              {stations.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-ink-muted">{s.address}</p>
                  </Td>
                  <Td>{cityName.get(s.cityId) ?? "–"}</Td>
                  <Td>
                    {s.availableVehicles} available
                    <span className="text-ink-muted"> · cap. {s.capacity}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">{hoursLabel(s)}</Td>
                  <Td>
                    <StatusChip tone={s.status === "ACTIVE" ? "success" : "muted"}>
                      {s.status === "ACTIVE" ? "Open" : "Closed"}
                    </StatusChip>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <RowLink href={`/admin/stations/${s.id}`}>Edit</RowLink>
                      <RowButton action={setStationStatus.bind(null, s.id, s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
                        {s.status === "ACTIVE" ? "Close" : "Open"}
                      </RowButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>

        <Panel title="Add a station">
          {cities.length === 0 ? (
            <p className="text-sm text-ink-muted">Add a city first.</p>
          ) : (
            <ActionForm action={createStation} submitLabel="Add station" resetOnSuccess>
              <SelectField
                label="City"
                name="cityId"
                placeholder="Choose a city"
                options={cities.map((c) => ({ value: c.id, label: c.name }))}
                required
              />
              <Field label="Name" name="name" placeholder="Indiranagar" required />
              <Field label="Address" name="address" required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude" name="latitude" type="number" step="any" placeholder="12.9784" required />
                <Field label="Longitude" name="longitude" type="number" step="any" placeholder="77.6408" required />
              </div>
              <Field label="Capacity" name="capacity" type="number" min={1} placeholder="10" required hint="Most scooters the station can hold." />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Opens" name="opensAt" type="time" />
                <Field label="Closes" name="closesAt" type="time" />
              </div>
              <p className="-mt-2 text-sm text-ink-muted">Leave both empty if the station is always open.</p>
            </ActionForm>
          )}
        </Panel>
      </div>
    </>
  );
}
