import { AppBar } from "@/components/app/AppBar";
import { AppShell } from "@/components/app/AppShell";
import { BottomNav } from "@/components/app/BottomNav";
import { ButtonLink } from "@/components/app/ButtonLink";
import { StatusChip } from "@/components/app/StatusChip";
import { Wordmark } from "@/components/app/Wordmark";
import { homeFor } from "@/lib/access";
import { getHealth, type CheckStatus } from "@/lib/api";
import { getCurrentUser } from "@/lib/dal";

export const dynamic = "force-dynamic";

function Row({ label, status }: { label: string; status: CheckStatus | undefined }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-ink-muted">{label}</span>
      {status === "up" ? (
        <StatusChip tone="success">Up</StatusChip>
      ) : status === "down" ? (
        <StatusChip tone="danger">Down</StatusChip>
      ) : (
        <StatusChip tone="muted">Unknown</StatusChip>
      )}
    </div>
  );
}

export default async function Home() {
  const [health, user] = await Promise.all([getHealth(), getCurrentUser()]);
  const staffHome = user && user.role !== "CUSTOMER" ? homeFor(user.role) : null;

  return (
    <AppShell>
      <AppBar title={<Wordmark />} />
      <main className="flex-1 px-5 pb-28 pt-4">
        <h2 className="text-xl font-semibold tracking-tight">
          {user ? `Hi, ${user.fullName.split(" ")[0]}` : "Rent a scooter, your way"}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {user
            ? "Scooter browsing arrives in a later phase."
            : "Sign in or create an account to get started. Scooter browsing arrives in a later phase."}
        </p>

        <div className="mt-6 space-y-3">
          {user ? (
            staffHome && <ButtonLink href={staffHome}>Open your console</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login">Sign in</ButtonLink>
              <ButtonLink href="/register" variant="secondary">
                Create account
              </ButtonLink>
            </>
          )}
        </div>

        <section className="mt-8 rounded-card border border-line bg-surface px-4">
          <div className="flex items-center justify-between border-b border-line py-3">
            <h3 className="text-sm font-medium">Backend status</h3>
            {health === null ? (
              <StatusChip tone="danger">Unreachable</StatusChip>
            ) : health.status === "ok" ? (
              <StatusChip tone="success">All systems up</StatusChip>
            ) : (
              <StatusChip tone="warning">Degraded</StatusChip>
            )}
          </div>
          <div className="divide-y divide-line">
            <Row label="API" status={health ? "up" : "down"} />
            <Row label="Database" status={health?.checks.database} />
            <Row label="Redis" status={health?.checks.redis} />
          </div>
        </section>
      </main>
      <BottomNav active="home" />
    </AppShell>
  );
}
