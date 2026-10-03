import { logout } from "@/app/actions/auth";
import { AppBar } from "@/components/app/AppBar";
import { AppShell } from "@/components/app/AppShell";
import { StatusChip } from "@/components/app/StatusChip";
import { SubmitButton } from "@/components/app/SubmitButton";
import { requireRole } from "@/lib/dal";

export const metadata = { title: "Station console" };

export default async function StaffHome() {
  const user = await requireRole("/staff", "STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN");
  return (
    <AppShell>
      <AppBar title="Station console" />
      <main className="flex-1 space-y-4 px-5 pb-10 pt-2">
        <section className="rounded-card border border-line bg-surface p-4">
          <p className="font-medium">{user.fullName}</p>
          <p className="text-sm text-ink-muted">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusChip tone="muted">{user.role.replace("_", " ").toLowerCase()}</StatusChip>
            <span className="text-sm text-ink-muted">
              {user.scope?.stationIds.length ?? 0} station(s) assigned
            </span>
          </div>
        </section>
        <p className="text-sm text-ink-muted">
          Pickups and returns arrive in a later phase. Your access to this page is checked by role.
        </p>
        <form action={logout}>
          <SubmitButton variant="secondary">Sign out</SubmitButton>
        </form>
      </main>
    </AppShell>
  );
}
