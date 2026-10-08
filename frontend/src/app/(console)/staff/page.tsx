import Link from "next/link";
import { Search } from "lucide-react";
import { DeskFilters } from "@/components/desk/DeskFilters";
import { EmptyRow, PageHeader, TableWrap, Td, Th } from "@/components/admin/ui";
import { BookingStatusChip } from "@/components/booking/BookingStatusChip";
import { requireRole } from "@/lib/dal";
import { formatMoney, formatRange } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { formatPhone } from "@/lib/phone";
import { apiGet, apiGetAll } from "@/lib/server-api";
import type { DeskTab, Page, StaffBookingView, StationView } from "@/lib/types";

export const metadata = { title: "Station desk" };
export const dynamic = "force-dynamic";

const TABS: { id: DeskTab; label: string; empty: string }[] = [
  { id: "pickups", label: "Pickups", empty: "No scooters are waiting to be collected." },
  { id: "rides", label: "On a ride", empty: "No scooters are out right now." },
  { id: "past", label: "Done", empty: "Nothing finished in the last 7 days." },
];

/** What the row's button says: the next thing staff can do with the booking. */
function nextStep(b: StaffBookingView): string {
  if (b.actions.pickup.allowed) return "Hand over";
  if (b.actions.return.allowed) return "Take back";
  if (b.actions.noShow.allowed) return "No-show?";
  return "Open";
}

export default async function StationDesk({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; station?: string }>;
}) {
  const user = await requireRole("/staff", "STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN");
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 60);
  const stations = await apiGetAll<StationView>("/manage/stations");
  const stationId = isUuid(query.station) && stations.some((s) => s.id === query.station) ? query.station : undefined;
  // Searching without choosing a tab looks everywhere; otherwise the queue starts on today's pickups.
  const tab = TABS.find((t) => t.id === query.tab)?.id ?? (q ? undefined : "pickups");

  if (stations.length === 0) {
    return (
      <>
        <PageHeader title="Station desk" />
        <p className="text-ink-muted">
          {user.role === "STATION_EMPLOYEE" ? "You aren't assigned to a station yet. Ask your city manager." : "There are no stations yet."}
        </p>
      </>
    );
  }

  const params = new URLSearchParams({ limit: "50" });
  if (tab) params.set("tab", tab);
  if (q) params.set("q", q);
  if (stationId) params.set("stationId", stationId);
  const result = await apiGet<Page<StaffBookingView>>(`/station/bookings?${params}`);
  const active = TABS.find((t) => t.id === tab);
  const href = (t: DeskTab) => `/staff?${new URLSearchParams({ tab: t, ...(q && { q }), ...(stationId && { station: stationId }) })}`;

  return (
    <>
      <PageHeader title="Station desk" description="Hand scooters over, take them back and look after customers who don't turn up." />

      <DeskFilters stations={stations.map((s) => ({ id: s.id, name: s.name }))} stationId={stationId} tab={tab} q={q} />

      <nav aria-label="Queue" className="mb-6 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={href(t.id)}
            aria-current={t.id === tab ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              t.id === tab ? "bg-ink text-white" : "border border-line bg-surface hover:bg-canvas"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {q && (
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <Search size={14} aria-hidden="true" /> {result.total} {result.total === 1 ? "booking" : "bookings"} for &ldquo;{q}&rdquo;
        </p>
      )}

      <TableWrap>
        <thead>
          <tr>
            <Th>Booking</Th>
            <Th>Customer</Th>
            <Th>Scooter</Th>
            <Th>Time</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 && <EmptyRow colSpan={6}>{q ? "No booking matches that." : (active?.empty ?? "Nothing here.")}</EmptyRow>}
          {result.items.map((b) => (
            <tr key={b.id}>
              <Td label="Booking" className="font-mono font-medium">
                {b.code}
                <span className="block font-sans text-xs font-normal text-ink-muted">{b.station.name}</span>
              </Td>
              <Td label="Customer">
                <p className="font-medium">{b.customer.fullName}</p>
                <p className="text-xs text-ink-muted">{b.customer.phone ? formatPhone(b.customer.phone) : "No phone"}</p>
              </Td>
              <Td label="Scooter">
                {b.vehicle.code}
                <span className="block text-xs text-ink-muted">
                  {b.vehicle.model.brand} {b.vehicle.model.name}
                </span>
              </Td>
              <Td label="Time">
                {formatRange(b.startAt, b.endAt, b.station.timezone)}
                <span className="block text-xs text-ink-muted">{formatMoney(b.totalAmount)} paid</span>
              </Td>
              <Td label="Status">
                <BookingStatusChip status={b.status} />
              </Td>
              <Td className="text-right">
                <Link
                  href={`/staff/bookings/${b.id}`}
                  className="inline-flex rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-canvas"
                >
                  {nextStep(b)}
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
