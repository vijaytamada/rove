import { ButtonLink } from "@/components/app/ButtonLink";
import { homeFor } from "@/lib/access";
import { getCurrentUser } from "@/lib/dal";

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
              : "Browse stations and see which scooters are available. Booking arrives in a later phase."
            : "Pick up at a station near you, ride, and drop it off at any station in your city. Simple pricing and a refundable deposit."}
        </p>

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
              <ButtonLink href="/register" variant="secondary">
                Create account
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
