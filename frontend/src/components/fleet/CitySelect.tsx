"use client";

import Link from "next/link";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/app/Modal";
import type { CityView } from "@/lib/types";

interface Props {
  cities: CityView[];
  selectedId: string;
}

/** Past this many cities the picker gets a search box. */
const SEARCH_FROM = 8;

/**
 * City picker that stays compact however many cities there are: one button showing the current city,
 * which opens a list in a popup. With a single city there is nothing to pick, so it is just a label.
 */
export function CitySelect({ cities, selectedId }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = cities.find((c) => c.id === selectedId) ?? cities[0];

  if (cities.length <= 1) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-ink-muted">
        <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
        {selected.name}, {selected.state}
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = q ? cities.filter((c) => `${c.name} ${c.state}`.toLowerCase().includes(q)) : cities;
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface pl-4 pr-3 text-sm font-medium transition-colors hover:bg-canvas"
      >
        <MapPin size={16} strokeWidth={1.75} className="text-ink-muted" aria-hidden="true" />
        {selected.name}
        <ChevronDown size={16} className="text-ink-muted" aria-hidden="true" />
      </button>

      <Modal open={open} onClose={close} title="Choose a city" size="max-w-md">
        {cities.length >= SEARCH_FROM && (
          <label className="relative mb-3 block">
            <span className="sr-only">Search cities</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cities"
              className="h-11 w-full rounded-control border border-line bg-surface pl-10 pr-4 text-base outline-none focus:border-ink"
            />
          </label>
        )}
        <ul className="space-y-1">
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                href={`/stations?city=${c.id}`}
                onClick={close}
                aria-current={c.id === selected.id ? "true" : undefined}
                className="flex min-h-12 items-center justify-between gap-3 rounded-control px-3 hover:bg-canvas"
              >
                <span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-sm text-ink-muted">{c.state}</span>
                </span>
                {c.id === selected.id && <Check size={18} className="text-accent" aria-hidden="true" />}
              </Link>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">No city matches your search.</li>}
        </ul>
      </Modal>
    </>
  );
}
