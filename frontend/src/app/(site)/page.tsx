import { ButtonLink } from "@/components/app/ButtonLink";
import Link from "next/link";
import { BookingCard } from "@/components/booking/BookingCard";
import { BookingStatusChip } from "@/components/booking/BookingStatusChip";
import { homeFor } from "@/lib/access";
import { getCustomerDashboard } from "@/lib/bookings";
import { getCurrentUser } from "@/lib/dal";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Choose a station", body: "Pick your city and the station closest to you." },
  { title: "Book and pay", body: "Select a scooter and duration. Pay the rental plus a refundable deposit." },
  { title: "Pick up", body: "Show your booking code and PIN at the station and ride away." },
  { title: "Return and settle", body: "Drop it at any station in your city. Your deposit comes back, minus any extra charges." },
];

export default async function Home() {
  const user = await getCurrentUser();
  const consoleHref = user && user.role !== "CUSTOMER" ? homeFor(user.role) : null;
  const firstName = user?.fullName.split(" ")[0];
  const dash = user?.role === "CUSTOMER" ? await getCustomerDashboard() : null;
  const next = dash?.active ?? dash?.upcoming ?? null;

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16 lg:py-8">
      <section>
        <p className="text-sm font-medium text-accent-ink">Electric scooter rentals</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {user ? `Hi, ${firstName}` : "Rent an e-scooter. Return it at any station."}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-muted">
          {user
            ? consoleHref
              ? "Your console is ready."
              : "Find a station, pick a scooter and book it in a minute."
            : "Pick up at a station near you, ride, and drop it off at any station in your city. Simple pricing and a refundable deposit."}
        </p>

        {dash?.owed && (
          <Link
            href={`/bookings/${dash.owed.bookingId}/settle`}
            className="mt-8 block max-w-md rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700 transition-colors hover:bg-red-100"
          >
            <span className="font-medium">You owe {formatMoney(dash.owed.amount)} for your last ride.</span> Pay it to book again.
          </Link>
        )}

        {next && (
          <div className="mt-8 max-w-md">
            <h2 className="mb-3 text-sm font-medium text-ink-muted">
              {next.status === "PENDING_PAYMENT" ? "Finish your booking" : dash?.active ? "Your booking" : "Coming up"}
            </h2>
            <BookingCard booking={next} />
          </div>
        )}

        {dash && dash.recent.length > 0 && (
          <div className="mt-8 max-w-md">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-ink-muted">Recent rides</h2>
              {dash.stats.rides > 0 && (
                <p className="text-sm text-ink-muted">
                  {dash.stats.rides} {dash.stats.rides === 1 ? "ride" : "rides"} · {dash.stats.distanceKm} km
                </p>
              )}
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {dash.recent.map((b) => (
                <li key={b.id}>
                  <Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-canvas">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {b.vehicle.model.brand} {b.vehicle.model.name}
                      </span>
                      <span className="block truncate text-ink-muted">
                        {b.station.name} · {new Date(b.startAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: b.station.timezone })}
                      </span>
                    </span>
                    <BookingStatusChip status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
          {user ? (
            <>
              <ButtonLink href="/stations">Browse stations</ButtonLink>
              {consoleHref && (
                <ButtonLink href={consoleHref} variant="secondary">
                  Open your console
                </ButtonLink>
              )}
            </>
          ) : (
            <>
              <ButtonLink href="/stations">Browse stations</ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="rounded-card border border-line bg-surface p-6 sm:p-8">
        <h2 id="how-it-works" className="text-lg font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="mt-6 space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent-ink"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-0.5 text-sm text-ink-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
