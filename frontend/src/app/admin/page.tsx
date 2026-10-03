import { logout } from "@/app/actions/auth";
import { AppBar } from "@/components/app/AppBar";
import { AppShell } from "@/components/app/AppShell";
import { StatusChip } from "@/components/app/StatusChip";
import { SubmitButton } from "@/components/app/SubmitButton";
import { requireRole } from "@/lib/dal";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const user = await requireRole("/admin", "CITY_MANAGER", "SUPER_ADMIN");
  return (
    <AppShell>
      <AppBar title="Admin" />
      <main className="flex-1 space-y-4 px-5 pb-10 pt-2">
        <section className="rounded-card border border-line bg-surface p-4">
          <p className="font-medium">{user.fullName}</p>
          <p className="text-sm text-ink-muted">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusChip tone="muted">{user.role.replace("_", " ").toLowerCase()}</StatusChip>
            {user.role === "CITY_MANAGER" && (
              <span className="text-sm text-ink-muted">{user.scope?.cityIds.length ?? 0} city(ies) assigned</span>
            )}
          </div>
        </section>
        <p className="text-sm text-ink-muted">
          City, station and fleet management arrive in Phase 3. User administration is available through the API
          (Swagger) for now.
        </p>
        <form action={logout}>
          <SubmitButton variant="secondary">Sign out</SubmitButton>
        </form>
      </main>
    </AppShell>
  );
}
