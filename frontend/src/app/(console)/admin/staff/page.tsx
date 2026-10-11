import { setStaffStatus } from "@/app/actions/admin";
import { AddDialog } from "@/components/admin/AddDialog";
import { StaffCreateForm } from "@/components/admin/StaffCreateForm";
import { EmptyRow, ErrorBanner, PageHeader, RowButton, RowLink, TableWrap, Td, Th } from "@/components/admin/ui";
import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";
import { apiGetAll, getStaff } from "@/lib/server-api";
import type { CityView, Role, StationView, UserView } from "@/lib/types";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  CITY_MANAGER: "City manager",
  STATION_EMPLOYEE: "Station employee",
  CUSTOMER: "Customer",
};

export default async function StaffAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; role?: string }> }) {
  const user = await requireRole("/admin/staff", "CITY_MANAGER", "SUPER_ADMIN");
  const { error } = await searchParams;
  const isAdmin = user.role === "SUPER_ADMIN";

  const [people, cities, stations] = await Promise.all([
    getStaff(user.role),
    apiGetAll<CityView>("/manage/cities"),
    apiGetAll<StationView>("/manage/stations"),
  ]);
  const cityName = new Map(cities.map((c) => [c.id, c.name]));
  const stationName = new Map(stations.map((s) => [s.id, s.name]));

  const where = (p: UserView) => {
    const names = [
      ...(p.scope?.cityIds ?? []).map((id) => cityName.get(id) ?? "a city"),
      ...(p.scope?.stationIds ?? []).map((id) => stationName.get(id) ?? "another city's station"),
    ];
    return names.length ? names.join(", ") : p.role === "SUPER_ADMIN" ? "Everywhere" : "–";
  };

  return (
    <>
      <PageHeader
        title="Staff"
        description={isAdmin ? "City managers, station employees and admins." : "Station employees in your cities."}
        action={
          <AddDialog label="Add staff" title="Add a staff account">
            <StaffCreateForm
              roles={isAdmin ? ["STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN"] : ["STATION_EMPLOYEE"]}
              cities={cities.map((c) => ({ id: c.id, name: c.name }))}
              stations={stations.map((s) => ({ id: s.id, name: s.name, cityName: cityName.get(s.cityId) }))}
            />
          </AddDialog>
        }
      />
      <ErrorBanner message={error} />

      <TableWrap>
        <thead>
          <tr>
            <Th>Person</Th>
            <Th>Role</Th>
            <Th>Works at</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {people.length === 0 && <EmptyRow colSpan={5}>No staff yet.</EmptyRow>}
          {people.map((p) => (
            <tr key={p.id}>
              <Td label="Person">
                <p className="font-medium">{p.fullName}</p>
                <p className="text-xs text-ink-muted">{p.email}</p>
              </Td>
              <Td label="Role" className="whitespace-nowrap">{ROLE_LABEL[p.role]}</Td>
              <Td label="Works at" className="max-w-64 text-ink-muted">{where(p)}</Td>
              <Td label="Status">
                <StatusChip tone={p.status === "ACTIVE" ? "success" : "danger"}>
                  {p.status === "ACTIVE" ? "Active" : "Disabled"}
                </StatusChip>
              </Td>
              <Td>
                <div className="flex justify-end gap-2">
                  <RowLink href={`/admin/staff/${p.id}`}>Manage</RowLink>
                  {p.id !== user.id && (
                    <RowButton
                      action={setStaffStatus.bind(null, p.id, p.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}
                      tone={p.status === "ACTIVE" ? "danger" : "default"}
                    >
                      {p.status === "ACTIVE" ? "Disable" : "Enable"}
                    </RowButton>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
