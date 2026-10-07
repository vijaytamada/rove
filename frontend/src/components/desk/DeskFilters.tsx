"use client";

import { Search } from "lucide-react";
import { useRef } from "react";

/** Search by code, phone or name, and (when someone runs several stations) pick which station. Submits as a plain GET form. */
export function DeskFilters({
  stations,
  stationId,
  tab,
  q,
}: {
  stations: { id: string; name: string }[];
  stationId?: string;
  tab?: string;
  q: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} method="get" action="/staff" className="mb-5 flex flex-col gap-3 sm:flex-row">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <label className="relative block flex-1">
        <span className="sr-only">Search bookings</span>
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Booking code, phone number or name"
          className="h-12 w-full rounded-control border border-line bg-surface pl-11 pr-4 text-base outline-none placeholder:text-ink-faint focus:border-ink"
        />
      </label>
      {stations.length > 1 && (
        <>
          <label className="sr-only" htmlFor="desk-station">
            Station
          </label>
          <select
            id="desk-station"
            name="station"
            defaultValue={stationId ?? ""}
            onChange={() => form.current?.requestSubmit()}
            className="select-chevron h-12 rounded-control border border-line bg-surface px-4 pr-10 text-base outline-none focus:border-ink sm:w-64"
          >
            <option value="">All my stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      )}
      <button type="submit" className="h-12 rounded-full bg-ink px-6 text-base font-medium text-white transition-colors hover:bg-ink/90">
        Search
      </button>
    </form>
  );
}
