import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ErrorBanner, PageHeader } from "@/components/admin/ui";
import { BreakdownTable } from "@/components/dashboard/BreakdownTable";
import { MetricsSections } from "@/components/dashboard/MetricsSections";
import { RangeTabs, parseRange } from "@/components/dashboard/RangeTabs";
import { Stat } from "@/components/dashboard/Stat";
import { requireRole } from "@/lib/dal";
import { isUuid } from "@/lib/ids";
import { apiGet, apiGetAll, getStaff } from "@/lib/server-api";
import type { AdminDashboard, CityDashboard, CityView, Page } from "@/lib/types";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const total = async (path: string) => (await apiGet<Page<unknown>>(`${path}${path.includes("?") ? "&" : "?"}limit=1`)).total;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string; range?: string; city?: string }> }) {
  const user = await requireRole("/admin", "CITY_MANAGER", "SUPER_ADMIN");
  const query = await searchParams;
  const range = parseRange(query.range);
  const isAdmin = user.role === "SUPER_ADMIN";

  // Managers always look at one of their cities; admins see the whole network, or drill into one city.
  const cities = await apiGetAll<CityView>("/manage/cities");
  const chosen = isUuid(query.city) ? cities.find((c) => c.id === query.city) : undefined;
  const cityId = chosen?.id ?? (isAdmin ? undefined : cities[0]?.id);

  const [stations, staff] = await Promise.all([total("/manage/stations"), getStaff(user.role).then((s) => s.length)]);

  if (!isAdmin && !cityId) {
    return (
      <>
        <PageHeader title="Overview" description="Network status for the cities assigned to you." />
        <p className="text-ink-muted">No city is assigned to you yet. Ask a super admin.</p>
      </>
    );
  }

  const network = !cityId ? await apiGet<AdminDashboard>(`/dashboard/admin?range=${range}`) : null;
  const city = cityId ? await apiGet<CityDashboard>(`/dashboard/city/${cityId}?range=${range}`) : null;
  const data = network ?? city!;
  const keep: Record<string, string> = cityId ? { city: cityId } : {};

  return (
    <>
      <PageHeader
        title="Overview"
        description={city ? `${city.city.name}: how the city is doing.` : "Network status for all cities."}
      />
      <ErrorBanner message={query.error} />

      {isAdmin && city && (
        <Link href={`/admin?range=${range}`} className="-mt-4 mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden="true" /> All cities
        </Link>
      )}
      {!isAdmin && cities.length > 1 && (
        <nav aria-label="Cities" className="mb-6 flex gap-2 overflow-x-auto">
          {cities.map((c) => (
            <Link
              key={c.id}
              href={`/admin?${new URLSearchParams({ city: c.id, range })}`}
              aria-current={c.id === cityId ? "page" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                c.id === cityId ? "bg-ink text-white" : "border border-line bg-surface hover:bg-canvas"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-6">
        <RangeTabs current={range} basePath="/admin" keep={keep} />
      </div>

      {/* The staff count covers everything the signed-in user manages, so it is left out when an admin looks at one city. */}
      <div className={`mb-6 grid gap-3 sm:gap-4 ${isAdmin && city ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        <Stat label="Cities" value={city ? 1 : cities.length} href="/admin/cities" />
        <Stat label="Stations" value={city ? city.stations.length : stations} href="/admin/stations" />
        {!(isAdmin && city) && (
          <Stat label="Staff" value={staff} href="/admin/staff" hint={user.role === "CITY_MANAGER" ? "station employees" : undefined} />
        )}
      </div>

      <MetricsSections m={data} fleetHref="/admin/fleet" />

      <h2 className="mb-3 mt-8 text-base font-semibold tracking-tight">{city ? "Stations" : "Cities"}</h2>
      {network && (
        <BreakdownTable rows={network.cities} noun="City" hrefFor={(r) => `/admin?${new URLSearchParams({ city: r.id, range })}`} />
      )}
      {city && <BreakdownTable rows={city.stations} noun="Station" hrefFor={(r) => `/admin/stations/${r.id}`} />}
    </>
  );
}
