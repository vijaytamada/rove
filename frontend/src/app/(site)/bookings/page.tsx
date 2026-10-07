import Link from "next/link";
import { BookingCard } from "@/components/booking/BookingCard";
import { requireRole } from "@/lib/dal";
import { apiGet } from "@/lib/server-api";
import type { BookingTab, BookingView, Page } from "@/lib/types";

export const metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";

const TABS: { id: BookingTab; label: string; empty: string }[] = [
  { id: "active", label: "Active", empty: "Nothing active right now." },
  { id: "upcoming", label: "Upcoming", empty: "No upcoming bookings." },
  { id: "past", label: "Past", empty: "Finished and cancelled bookings show up here." },
];

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole("/bookings", "CUSTOMER");
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.id === tabParam) ?? TABS[0];
  const bookings = await apiGet<Page<BookingView>>(`/bookings?tab=${tab.id}&limit=50`);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My bookings</h1>

      <nav aria-label="Booking status" className="mt-6 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/bookings?tab=${t.id}`}
            aria-current={t.id === tab.id ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              t.id === tab.id ? "bg-ink text-white" : "border border-line bg-surface hover:bg-canvas"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {bookings.items.length === 0 ? (
        <div className="mt-8 rounded-card border border-line bg-surface p-8 text-center">
          <p className="text-ink-muted">{tab.empty}</p>
          {tab.id !== "past" && (
            <Link href="/stations" className="mt-4 inline-block text-sm font-medium underline">
              Find a scooter
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {bookings.items.map((b) => (
            <li key={b.id}>
              <BookingCard booking={b} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
