import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const user = await requireRole("/admin", "CITY_MANAGER", "SUPER_ADMIN");
  const cities = user.scope?.cityIds.length ?? 0;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-2 text-ink-muted">Manage cities, stations, fleet and staff.</p>

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
          <h2 className="text-sm font-medium text-ink-muted">Your cities</h2>
          <p className="mt-2 text-3xl font-semibold">{user.role === "SUPER_ADMIN" ? "All" : cities}</p>
          <p className="text-sm text-ink-muted">
            {user.role === "SUPER_ADMIN" ? "Global access" : "assigned to you"}
          </p>
        </section>
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        City, station and fleet management arrive in Phase 3. Until then, user administration is available through the
        API (Swagger).
      </p>
    </>
  );
}
