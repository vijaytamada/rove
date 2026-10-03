import { AppBar } from "@/components/app/AppBar";
import { AppShell } from "@/components/app/AppShell";
import { BottomNav } from "@/components/app/BottomNav";
import { StatusChip } from "@/components/app/StatusChip";
import { getHealth, type CheckStatus } from "@/lib/api";
import { APP_NAME } from "@/lib/config";

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
  const health = await getHealth();

  return (
    <AppShell>
      <AppBar
        title={
          <span className="text-lg font-semibold lowercase">
            {APP_NAME}
            <span className="text-accent">.</span>
          </span>
        }
      />
      <main className="flex-1 px-5 pb-28 pt-4">
        <h2 className="text-xl font-semibold tracking-tight">Phase 1 foundation</h2>
        <p className="mt-1 text-sm text-ink-muted">
          The web app is running. Scooter browsing arrives in a later phase.
        </p>

        <section className="mt-6 rounded-card border border-line bg-surface px-4">
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
      <BottomNav />
    </AppShell>
  );
}
