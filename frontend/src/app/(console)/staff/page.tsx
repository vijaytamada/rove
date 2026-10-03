import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";

export const metadata = { title: "Station console" };

export default async function StaffHome() {
  const user = await requireRole("/staff", "STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN");
  const stations = user.scope?.stationIds.length ?? 0;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Station console</h1>
      <p className="mt-2 text-ink-muted">Pickups and returns for your stations.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="text-sm font-medium text-ink-muted">Signed in as</h2>
          <p className="mt-2 text-lg font-semibold">{user.fullName}</p>
          <p className="text-sm text-ink-muted">{user.email}</p>
          <div className="mt-3">
            <StatusChip tone="muted">{user.role.replace("_", " ").toLowerCase()}</StatusChip>
          </div>
        </section>
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="text-sm font-medium text-ink-muted">Your stations</h2>
          <p className="mt-2 text-3xl font-semibold">{stations}</p>
          <p className="text-sm text-ink-muted">
            {user.role === "SUPER_ADMIN" ? "Super admins can access every station." : "assigned to you"}
          </p>
        </section>
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        Pickup and return screens arrive in a later phase. Access to this page is checked by role.
      </p>
    </>
  );
}
