import Link from "next/link";
import { EmptyRow, TableWrap, Td, Th } from "@/components/admin/ui";
import { formatMoney } from "@/lib/format";
import type { DashboardRow } from "@/lib/types";

/** One row per city (admin) or per station (manager): the numbers that say where to look first. */
export function BreakdownTable({
  rows,
  noun,
  hrefFor,
}: {
  rows: (DashboardRow & { stations?: number })[];
  noun: "City" | "Station";
  hrefFor?: (row: DashboardRow) => string;
}) {
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>{noun}</Th>
          <Th>Scooters</Th>
          <Th>On a ride</Th>
          <Th>Waiting</Th>
          <Th>Owed</Th>
          <Th>Collected</Th>
          <Th>Busy</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyRow colSpan={7}>Nothing here yet.</EmptyRow>}
        {rows.map((r) => (
          <tr key={r.id}>
            <Td label={noun} className="font-medium">
              {hrefFor ? (
                <Link href={hrefFor(r)} className="underline-offset-2 hover:underline">
                  {r.name}
                </Link>
              ) : (
                r.name
              )}
              {r.stations !== undefined && (
                <span className="block text-xs font-normal text-ink-muted">
                  {r.stations} {r.stations === 1 ? "station" : "stations"}
                </span>
              )}
            </Td>
            <Td label="Scooters">
              {r.fleet.available}
              <span className="text-ink-muted"> of {r.fleet.total} free</span>
            </Td>
            <Td label="On a ride">
              {r.now.ridesOut}
              {r.now.overdueRides > 0 && <span className="block text-xs text-amber-700">{r.now.overdueRides} late</span>}
            </Td>
            <Td label="Waiting">{r.now.waitingPickups}</Td>
            <Td label="Owed" className={r.now.owed.count > 0 ? "text-danger" : ""}>
              {formatMoney(r.now.owed.amount)}
            </Td>
            <Td label="Collected">{formatMoney(r.money.collected)}</Td>
            <Td label="Busy">{r.utilizationPercent}%</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
