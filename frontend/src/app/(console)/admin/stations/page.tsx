import { createStation, setStationStatus } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { AddDialog } from "@/components/admin/AddDialog";
import { Field, FormGrid, SelectField } from "@/components/admin/Fields";
import { EmptyRow, ErrorBanner, PageHeader, RowButton, RowLink, TableWrap, Td, Th } from "@/components/admin/ui";
import { hoursLabel } from "@/components/fleet/StationCard";
import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";
import { isUuid } from "@/lib/ids";
import { apiGetAll } from "@/lib/server-api";
import type { CityView, StationView } from "@/lib/types";

export const metadata = { title: "Stations" };
export const dynamic = "force-dynamic";

export default async function StationsAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; city?: string }> }) {
  await requireRole("/admin/stations", "CITY_MANAGER", "SUPER_ADMIN");
  const { error, city } = await searchParams;
  const [cities, stations] = await Promise.all([
    apiGetAll<CityView>("/manage/cities"),
    apiGetAll<StationView>(`/manage/stations${isUuid(city) ? `?cityId=${city}` : ""}`),
  ]);
  const cityName = new Map(cities.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Stations"
        description="Pickup and return points."
        action={
          cities.length > 0 && (
            <AddDialog label="Add station" title="Add a station">
              <ActionForm action={createStation} submitLabel="Add station" resetOnSuccess>
                <FormGrid>
                  <SelectField
                    label="City"
                    name="cityId"
                    placeholder="Choose a city"
                    options={cities.map((c) => ({ value: c.id, label: c.name }))}
                    required
                  />
                  <Field label="Name" name="name" placeholder="Indiranagar" required />
                  <Field wide label="Address" name="address" required />
                  <Field label="Latitude" name="latitude" type="number" step="any" placeholder="12.9784" required />
                  <Field label="Longitude" name="longitude" type="number" step="any" placeholder="77.6408" required />
                  <Field wide label="Capacity" name="capacity" type="number" min={1} placeholder="10" required hint="Most scooters the station can hold." />
                  <Field label="Opens" name="opensAt" type="time" hint="Leave both times empty if the station is always open." />
                  <Field label="Closes" name="closesAt" type="time" />
                </FormGrid>
              </ActionForm>
            </AddDialog>
          )
        }
      />
      <ErrorBanner message={error} />

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
              <Td label="Station">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-ink-muted">{s.address}</p>
              </Td>
              <Td label="City">{cityName.get(s.cityId) ?? "–"}</Td>
              <Td label="Scooters">
                {s.availableVehicles} available
                <span className="text-ink-muted"> · cap. {s.capacity}</span>
              </Td>
              <Td label="Hours" className="whitespace-nowrap text-ink-muted">{hoursLabel(s)}</Td>
              <Td label="Status">
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
    </>
  );
}
