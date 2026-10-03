import { createStaff, setStaffStatus } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxGroup, Field, SelectField } from "@/components/admin/Fields";
import { EmptyRow, ErrorBanner, PageHeader, Panel, RowButton, RowLink, TableWrap, Td, Th } from "@/components/admin/ui";
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
      />
      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
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
                  <Td>
                    <p className="font-medium">{p.fullName}</p>
                    <p className="text-xs text-ink-muted">{p.email}</p>
                  </Td>
                  <Td>{ROLE_LABEL[p.role]}</Td>
                  <Td className="max-w-48 text-ink-muted">{where(p)}</Td>
                  <Td>
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
        </div>

        <Panel title="Add a staff account">
          <ActionForm action={createStaff} submitLabel="Create account" resetOnSuccess>
            <Field label="Full name" name="fullName" required />
            <Field label="Email" name="email" type="email" required />
            <Field label="Phone" name="phone" type="tel" placeholder="+919876543210" hint="Optional." />
            <Field label="Temporary password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters. Share it securely." />
            {isAdmin ? (
              <SelectField
                label="Role"
                name="role"
                defaultValue="STATION_EMPLOYEE"
                options={[
                  { value: "STATION_EMPLOYEE", label: "Station employee" },
                  { value: "CITY_MANAGER", label: "City manager" },
                  { value: "SUPER_ADMIN", label: "Super admin" },
                ]}
              />
            ) : (
              <input type="hidden" name="role" value="STATION_EMPLOYEE" />
            )}
            <CheckboxGroup
              label="Stations (for station employees)"
              name="stationIds"
              options={stations.map((s) => ({ value: s.id, label: s.name, hint: cityName.get(s.cityId) }))}
              hint="Employees need at least one station."
            />
            {isAdmin && (
              <CheckboxGroup
                label="Cities (for city managers)"
                name="cityIds"
                options={cities.map((c) => ({ value: c.id, label: c.name }))}
                hint="Only used when the role is City manager."
              />
            )}
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
