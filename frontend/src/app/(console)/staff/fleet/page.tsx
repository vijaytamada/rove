import { StatusForm } from "@/components/admin/StatusForm";
import { EmptyRow, ErrorBanner, PageHeader, TableWrap, Td, Th, VehicleStatusChip } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { apiGetAll } from "@/lib/server-api";
import type { StationView, VehicleManageView } from "@/lib/types";

export const metadata = { title: "Scooters" };
export const dynamic = "force-dynamic";

export default async function StaffHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("/staff/fleet", "STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN");
  const { error } = await searchParams;
  const [stations, vehicles] = await Promise.all([
    apiGetAll<StationView>("/manage/stations"),
    apiGetAll<VehicleManageView>("/manage/vehicles"),
  ]);

  const isEmployee = user.role === "STATION_EMPLOYEE";

  return (
    <>
      <PageHeader
        title="Scooters"
        description={isEmployee ? "Scooters at your stations." : "Scooters across the stations you manage."}
      />
      <ErrorBanner message={error} />

      {stations.length === 0 ? (
        <p className="text-ink-muted">
          {isEmployee ? "You aren't assigned to a station yet. Ask your city manager." : "There are no stations yet."}
        </p>
      ) : (
        stations.map((s) => {
          const here = vehicles.filter((v) => v.station?.id === s.id);
          return (
            <section key={s.id} className="mb-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{s.name}</h2>
                <p className="text-sm text-ink-muted">
                  {s.availableVehicles} available · {here.length} of {s.capacity} slots used
                </p>
              </div>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Scooter</Th>
                    <Th>Battery</Th>
                    <Th>Status</Th>
                    <Th>{isEmployee ? "Flag" : "Change status"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {here.length === 0 && <EmptyRow colSpan={4}>No scooters here.</EmptyRow>}
                  {here.map((v) => (
                    <tr key={v.id}>
                      <Td>
                        <p className="font-medium">{v.code}</p>
                        <p className="text-xs text-ink-muted">
                          {v.model.brand} {v.model.name}
                        </p>
                      </Td>
                      <Td>{v.batteryPercent === null ? "–" : `${v.batteryPercent}%`}</Td>
                      <Td>
                        <VehicleStatusChip status={v.status} />
                      </Td>
                      <Td>
                        {/* Employees may only flag maintenance; managers and admins can set any manual status. */}
                        <StatusForm vehicle={v} page="/staff/fleet" allowed={isEmployee ? ["MAINTENANCE"] : undefined} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </section>
          );
        })
      )}
    </>
  );
}
