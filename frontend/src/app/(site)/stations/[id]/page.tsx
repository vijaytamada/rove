import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { ScooterCard } from "@/components/fleet/ScooterCard";
import { hoursLabel } from "@/components/fleet/StationCard";
import { getStation, getStationVehicles } from "@/lib/api";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const station = UUID.test(id) ? await getStation(id) : null;
  return { title: station?.name ?? "Station" };
}

export default async function StationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [station, vehicles] = await Promise.all([getStation(id), getStationVehicles(id)]);
  if (!station) notFound();

  return (
    <>
      <Link
        href={`/stations?city=${station.cityId}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" /> All stations
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{station.name}</h1>
      <div className="mt-3 space-y-1.5 text-ink-muted">
        <p className="flex items-center gap-2">
          <MapPin size={18} strokeWidth={1.75} aria-hidden="true" />
          {station.address}
        </p>
        <p className="flex items-center gap-2">
          <Clock size={18} strokeWidth={1.75} aria-hidden="true" />
          {hoursLabel(station)}
        </p>
      </div>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">
        Available now{vehicles ? ` (${vehicles.length})` : ""}
      </h2>
      {vehicles === null ? (
        <p className="mt-4 text-ink-muted">We can&apos;t load scooters right now. Try again in a moment.</p>
      ) : vehicles.length === 0 ? (
        <p className="mt-4 text-ink-muted">No scooters are free here right now. Try another station.</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <li key={v.id}>
              <ScooterCard vehicle={v} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
