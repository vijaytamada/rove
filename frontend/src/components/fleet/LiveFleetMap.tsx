"use client";

import "leaflet/dist/leaflet.css";
import type { Circle, CircleMarker, Map as LeafletMap, Marker, Polyline } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { LiveFleet, LiveVehicle, TelemetryTrail, VehicleStatus } from "@/lib/types";

const POLL_MS = 5000;

const STATUS_LABEL: Record<VehicleStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  IN_RIDE: "On a ride",
  MAINTENANCE: "Maintenance",
  OFFLINE: "Offline",
};

/** Colours for the dots on the map. Status is also in the list, never by colour alone. */
const STATUS_COLOR: Record<VehicleStatus, string> = {
  AVAILABLE: "#10b981",
  RESERVED: "#3b82f6",
  IN_RIDE: "#0b0b0f",
  MAINTENANCE: "#f59e0b",
  OFFLINE: "#9ca3af",
};

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

type Load = { kind: "loading" } | { kind: "ok"; fleet: LiveFleet } | { kind: "error"; message: string; expired?: boolean };

/** Live positions of the scooters (and stations) a staff member can see, refreshed every few seconds. */
export function LiveFleetMap() {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const markers = useRef(new Map<string, CircleMarker>());
  const stationMarkers = useRef(new Map<string, Marker>());
  const trail = useRef<Polyline | null>(null);
  const halo = useRef<Circle | null>(null);
  const fitted = useRef(false);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fleet = load.kind === "ok" ? load.fleet : null;
  // A scooter that is no longer on a ride (it was brought back) is no longer followed.
  const selectedId = fleet?.vehicles.some((v) => v.vehicleId === selected && v.status === "IN_RIDE") ? selected : null;

  // Create the map once (Leaflet needs the browser, so it is loaded here and not on the server).
  useEffect(() => {
    let cancelled = false;
    const vehicleMarkers = markers.current;
    const stationPins = stationMarkers.current;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current || map.current) return;
      leaflet.current = L;
      const m = L.map(mapEl.current, { zoomControl: true }).setView([20.5937, 78.9629], 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      vehicleMarkers.clear();
      stationPins.clear();
    };
  }, []);

  // Poll the fleet, and pause while the tab is hidden.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const res = await fetch("/api/live-fleet", { cache: "no-store" });
        if (!alive) return;
        if (res.status === 401) {
          setLoad({ kind: "error", message: "Your session ended. Reload the page to continue.", expired: true });
          return;
        }
        if (!res.ok) throw new Error();
        const fleet = (await res.json()) as LiveFleet;
        if (!alive) return;
        setLoad({ kind: "ok", fleet });
        setNow(Date.now());
      } catch {
        if (alive) setLoad((prev) => (prev.kind === "ok" ? prev : { kind: "error", message: "Can't load the live map right now." }));
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Draw the markers whenever new data arrives.
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (load.kind !== "ok" || !L || !m) return;
    const { fleet } = load;

    const seenStations = new Set<string>();
    for (const s of fleet.stations) {
      seenStations.add(s.id);
      if (!stationMarkers.current.has(s.id)) {
        const icon = L.divIcon({ className: "", html: '<div style="width:12px;height:12px;background:#fff;border:2px solid #0b0b0f;border-radius:3px"></div>', iconSize: [12, 12] });
        stationMarkers.current.set(s.id, L.marker([s.latitude, s.longitude], { icon, keyboard: false }).bindTooltip(s.name).addTo(m));
      }
    }
    for (const [id, marker] of stationMarkers.current) {
      if (!seenStations.has(id)) {
        marker.remove();
        stationMarkers.current.delete(id);
      }
    }

    const seen = new Set<string>();
    const bounds: [number, number][] = fleet.stations.map((s) => [s.latitude, s.longitude]);
    for (const v of fleet.vehicles) {
      if (!v.position) continue;
      seen.add(v.vehicleId);
      const latlng: [number, number] = [v.position.latitude, v.position.longitude];
      bounds.push(latlng);
      const style = {
        radius: v.status === "IN_RIDE" ? 8 : 6,
        color: "#ffffff",
        weight: 2,
        fillColor: STATUS_COLOR[v.status],
        fillOpacity: v.position.stale ? 0.35 : 0.95,
      };
      const existing = markers.current.get(v.vehicleId);
      if (existing) {
        existing.setLatLng(latlng).setStyle(style);
      } else {
        const marker = L.circleMarker(latlng, style).addTo(m).on("click", () => setSelected((cur) => (cur === v.vehicleId ? null : v.vehicleId)));
        markers.current.set(v.vehicleId, marker);
      }
      markers.current.get(v.vehicleId)!.bindTooltip(`${v.code} · ${STATUS_LABEL[v.status]}`);
    }
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    if (!fitted.current && bounds.length > 0) {
      fitted.current = true;
      m.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [load]);

  // Follow the selected scooter: fly to it once, then keep its recent path and the ring around it up to date.
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    halo.current?.remove();
    halo.current = null;
    trail.current?.remove();
    trail.current = null;
    if (selectedId === null || !L || !m) return;
    const marker = markers.current.get(selectedId);
    if (marker) {
      halo.current = L.circle(marker.getLatLng(), { radius: 60, color: "#0b0b0f", weight: 1, fillOpacity: 0.05 }).addTo(m);
      m.flyTo(marker.getLatLng(), Math.max(m.getZoom(), 15), { duration: 0.6 });
    }
  }, [selectedId]);
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (load.kind !== "ok" || selectedId === null || !L || !m) return;
    let cancelled = false;
    const marker = markers.current.get(selectedId);
    if (marker) halo.current?.setLatLng(marker.getLatLng());
    (async () => {
      const res = await fetch(`/api/live-fleet/${selectedId}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const { points } = (await res.json()) as TelemetryTrail;
      if (cancelled) return;
      // Only the moving part: readings from before it set off sit at the station.
      const path = points.filter((p) => p.ignition).map((p) => [p.latitude, p.longitude] as [number, number]);
      if (trail.current) trail.current.setLatLngs(path);
      else if (path.length > 1) trail.current = L.polyline(path, { color: "#10b981", weight: 4, opacity: 0.8 }).addTo(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, selectedId]);

  const onRide = fleet?.vehicles.filter((v) => v.status === "IN_RIDE") ?? [];
  const counts = fleet
    ? (["AVAILABLE", "IN_RIDE", "RESERVED", "MAINTENANCE", "OFFLINE"] as VehicleStatus[]).map((s) => [s, fleet.vehicles.filter((v) => v.status === s).length] as const)
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="relative">
        <div ref={mapEl} role="application" aria-label="Map of scooters and stations" className="h-[60vh] min-h-80 w-full overflow-hidden rounded-card border border-line bg-canvas lg:h-[70vh]" />
        {load.kind === "loading" && <p className="absolute left-4 top-4 z-[500] rounded-control bg-surface px-3 py-2 text-sm shadow">Loading the fleet…</p>}
        {load.kind === "error" && (
          <p role="alert" className="absolute left-4 top-4 z-[500] rounded-control bg-red-50 px-3 py-2 text-sm text-red-700 shadow">
            {load.message}{" "}
            {load.expired && (
              <button type="button" onClick={() => window.location.reload()} className="font-medium underline">
                Reload
              </button>
            )}
          </p>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Fleet right now</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {counts.map(([status, n]) => (
              <li key={status} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-muted">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
                  {STATUS_LABEL[status]}
                </span>
                <span className="font-medium tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
          {fleet && <p className="mt-3 text-xs text-ink-muted">Updated {ago(fleet.generatedAt, now)}. Faded dots have gone quiet.</p>}
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">On a ride ({onRide.length})</h2>
          {onRide.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No scooters are out right now.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {onRide.map((v) => (
                <RideRow key={v.vehicleId} v={v} now={now} selected={selectedId === v.vehicleId} onSelect={() => setSelected(selectedId === v.vehicleId ? null : v.vehicleId)} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function RideRow({ v, now, selected, onSelect }: { v: LiveVehicle; now: number; selected: boolean; onSelect: () => void }) {
  const p = v.position;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full rounded-control px-2 py-2.5 text-left text-sm transition-colors hover:bg-canvas ${selected ? "bg-canvas" : ""}`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-medium">{v.code}</span>
          <span className="text-xs text-ink-muted">{v.booking?.code}</span>
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          {p ? (
            <>
              {Math.round(p.speedKmh)} km/h · battery {v.batteryPercent ?? "?"}% · {p.stale ? "no signal, last " : ""}
              {ago(p.recordedAt, now)}
            </>
          ) : (
            "No position yet"
          )}
        </span>
      </button>
    </li>
  );
}
