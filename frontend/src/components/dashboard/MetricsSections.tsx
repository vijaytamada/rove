import { Panel } from "@/components/admin/ui";
import { formatMoney } from "@/lib/format";
import type { DashboardMetrics } from "@/lib/types";
import { rangeLabel } from "./RangeTabs";
import { Stat } from "./Stat";

/**
 * The four blocks every management dashboard shares: what needs doing right now, the fleet, what happened in the
 * chosen window, and the money. Links lead to the lists behind the numbers. The backend works every figure out.
 */
export function MetricsSections({ m, fleetHref }: { m: DashboardMetrics; fleetHref?: string }) {
  const when = rangeLabel(m.window.key);
  const fleetLink = (status: string) => (fleetHref ? `${fleetHref}?status=${status}` : undefined);
  return (
    <div className="space-y-6">
      <Panel title="Right now">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Waiting for pickup" value={m.now.waitingPickups} href="/staff?tab=pickups" />
          <Stat
            label="Out on a ride"
            value={m.now.ridesOut}
            hint={m.now.overdueRides > 0 ? `${m.now.overdueRides} past the booked time` : "none late"}
            tone={m.now.overdueRides > 0 ? "warn" : "plain"}
            href="/staff?tab=rides"
          />
          <Stat
            label="Owed by customers"
            value={formatMoney(m.now.owed.amount)}
            hint={`${m.now.owed.count} ${m.now.owed.count === 1 ? "ride" : "rides"}`}
            tone={m.now.owed.count > 0 ? "bad" : "plain"}
            href="/staff/settlements"
          />
          <Stat
            label="Refunds not sent"
            value={m.now.refundsPending.count}
            hint={m.now.refundsPending.count > 0 ? formatMoney(m.now.refundsPending.amount) : "all sent"}
            tone={m.now.refundsPending.count > 0 ? "bad" : "plain"}
            href="/staff/settlements?tab=refunds"
          />
        </div>
        <p className="mt-4 text-sm text-ink-muted">Deposits held for rides that are not settled yet: {formatMoney(m.now.depositsHeld)}.</p>
      </Panel>

      <Panel title="Fleet">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <Stat label="Scooters" value={m.fleet.total} href={fleetHref} />
          <Stat label="Available" value={m.fleet.available} tone="good" href={fleetLink("AVAILABLE")} />
          <Stat label="On a ride" value={m.fleet.inRide} />
          <Stat label="In maintenance" value={m.fleet.maintenance} tone={m.fleet.maintenance > 0 ? "warn" : "plain"} href={fleetLink("MAINTENANCE")} />
          <Stat label="Offline" value={m.fleet.offline} href={fleetLink("OFFLINE")} />
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          Utilization over {when}: <span className="font-medium text-ink">{m.utilizationPercent}%</span> of scooter-hours were spent on rides.
        </p>
      </Panel>

      <Panel title={`Activity, ${when}`}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <Stat label="New bookings" value={m.activity.newBookings} />
          <Stat label="Rides started" value={m.activity.ridesStarted} />
          <Stat label="Rides finished" value={m.activity.ridesCompleted} />
          <Stat label="Cancellations" value={m.activity.cancellations} />
          <Stat label="No-shows" value={m.activity.noShows} />
        </div>
      </Panel>

      <Panel title={`Money, ${when}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Stat label="Collected" value={formatMoney(m.money.collected)} hint="payments received" />
          <Stat label="Refunded" value={formatMoney(m.money.refunded)} hint="sent back to customers" />
          <Stat label="Net" value={formatMoney(m.money.net)} hint="collected minus refunded" tone="good" />
        </div>
        <p className="mt-4 text-sm text-ink-muted">Net includes deposits that are still held, so it is not the same as what has been earned.</p>
      </Panel>
    </div>
  );
}
