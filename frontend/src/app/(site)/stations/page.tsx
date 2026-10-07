import { StationCard } from "@/components/fleet/StationCard";
import { CitySelect } from "@/components/fleet/CitySelect";
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

  // With one city it is chosen for you; with several, the first until you pick another.
  const selected = cities.find((c) => c.id === cityParam) ?? cities[0];
  const stations = (await getCityStations(selected.id)) ?? [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Stations</h1>
          <p className="mt-2 text-ink-muted">Pick a station to see the scooters you can ride.</p>
        </div>
        <CitySelect cities={cities} selectedId={selected.id} />
      </div>

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
