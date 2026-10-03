import Link from "next/link";
import { StationCard } from "@/components/fleet/StationCard";
import { getCities, getCityStations } from "@/lib/api";

export const metadata = { title: "Stations" };
export const dynamic = "force-dynamic";

export default async function StationsPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city: cityParam } = await searchParams;
  const cities = await getCities();

  if (cities === null) {
    return (
      <>
        <h1 className="text-3xl font-semibold tracking-tight">Stations</h1>
        <p className="mt-4 text-ink-muted">We can&apos;t load stations right now. Try again in a moment.</p>
      </>
    );
  }
  if (cities.length === 0) {
    return (
      <>
        <h1 className="text-3xl font-semibold tracking-tight">Stations</h1>
        <p className="mt-4 text-ink-muted">No cities are open yet. Check back soon.</p>
      </>
    );
  }

  const selected = cities.find((c) => c.id === cityParam) ?? cities[0];
  const stations = (await getCityStations(selected.id)) ?? [];

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Stations</h1>
      <p className="mt-2 text-ink-muted">Pick a city, then a station to see the scooters you can ride.</p>

      <nav aria-label="Cities" className="mt-6 flex flex-wrap gap-2">
        {cities.map((c) => (
          <Link
            key={c.id}
            href={`/stations?city=${c.id}`}
            aria-current={c.id === selected.id ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              c.id === selected.id ? "bg-ink text-white" : "border border-line bg-surface hover:bg-canvas"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      {stations.length === 0 ? (
        <p className="mt-10 text-ink-muted">There are no open stations in {selected.name} yet.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((s) => (
            <li key={s.id}>
              <StationCard station={s} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
