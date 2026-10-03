import Link from "next/link";
import { StatusChip } from "@/components/app/StatusChip";
import { ErrorBanner, PageHeader, Panel } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { apiGet, getStaff } from "@/lib/server-api";
import type { Page } from "@/lib/types";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const total = async (path: string) => (await apiGet<Page<unknown>>(`${path}${path.includes("?") ? "&" : "?"}limit=1`)).total;

function Stat({ label, value, href, hint }: { label: string; value: number | string; href?: string; hint?: string }) {
  const body = (
    <>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-card border border-line bg-surface p-5 transition-colors hover:border-ink/30">
      {body}
    </Link>
  ) : (
    <div className="rounded-card border border-line bg-surface p-5">{body}</div>
  );
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("/admin", "CITY_MANAGER", "SUPER_ADMIN");
  const { error } = await searchParams;

  const [cities, stations, vehicles, available, maintenance, offline, staff] = await Promise.all([
    total("/manage/cities"),
    total("/manage/stations"),
    total("/manage/vehicles"),
    total("/manage/vehicles?status=AVAILABLE"),
    total("/manage/vehicles?status=MAINTENANCE"),
    total("/manage/vehicles?status=OFFLINE"),
    getStaff(user.role).then((s) => s.length),
  ]);

  const scope = user.role === "SUPER_ADMIN" ? "all cities" : `${user.scope?.cityIds.length ?? 0} city(ies) assigned to you`;

  return (
    <>
      <PageHeader title="Overview" description={`Network status for ${scope}.`} />
      <ErrorBanner message={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cities" value={cities} href="/admin/cities" />
        <Stat label="Stations" value={stations} href="/admin/stations" />
        <Stat label="Scooters" value={vehicles} href="/admin/fleet" />
        <Stat label="Staff" value={staff} href="/admin/staff" hint={user.role === "CITY_MANAGER" ? "station employees" : undefined} />
      </div>

      <Panel title="Fleet status" className="mt-6">
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/fleet?status=AVAILABLE" className="rounded-full">
            <StatusChip tone="success">{available} available</StatusChip>
          </Link>
          <Link href="/admin/fleet?status=MAINTENANCE" className="rounded-full">
            <StatusChip tone="warning">{maintenance} in maintenance</StatusChip>
          </Link>
          <Link href="/admin/fleet?status=OFFLINE" className="rounded-full">
            <StatusChip tone="muted">{offline} offline</StatusChip>
          </Link>
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          Reserved and in-ride counts appear once bookings and rentals arrive in later phases.
        </p>
      </Panel>
    </>
  );
}
