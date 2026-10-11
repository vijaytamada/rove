import Link from "next/link";
import { EmptyRow, PageHeader, TableWrap, Td, Th } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { apiGet } from "@/lib/server-api";
import type { AuditEntryView, Page } from "@/lib/types";

export const metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  BOOKING_PICKUP: "Handed a scooter over",
  BOOKING_RETURN: "Took a scooter back",
  BOOKING_NO_SHOW: "Marked a no-show",
  SETTLEMENT_COLLECT: "Took a payment at the desk",
  SETTLEMENT_RETRY_REFUND: "Retried a refund",
  STAFF_CREATE: "Created a staff account",
  STAFF_UPDATE: "Changed a staff account",
  STAFF_ASSIGN: "Changed where staff work",
  PRICING_PLAN_CREATE: "Added a pricing plan",
  PRICING_PLAN_UPDATE: "Changed a pricing plan",
  VEHICLE_CREATE: "Added a scooter",
  VEHICLE_UPDATE: "Edited a scooter",
  VEHICLE_STATUS: "Changed a scooter's status",
  VEHICLE_RETIRE: "Retired a scooter",
  VEHICLE_MODEL_CREATE: "Added a vehicle model",
  VEHICLE_MODEL_UPDATE: "Edited a vehicle model",
  CITY_CREATE: "Added a city",
  CITY_UPDATE: "Edited a city",
  STATION_CREATE: "Added a station",
  STATION_UPDATE: "Edited a station",
  KYC_STARTED: "Identity check started",
  KYC_VERIFIED: "Identity verified",
  KYC_REJECTED: "Identity check rejected",
  KYC_RESET: "Reset identity-check tries",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  CITY_MANAGER: "City manager",
  STATION_EMPLOYEE: "Station employee",
  CUSTOMER: "Customer",
};

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; entityId?: string; action?: string }> }) {
  await requireRole("/admin/audit", "SUPER_ADMIN");
  const { page: pageParam, entityId, action } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
  if (entityId) qs.set("entityId", entityId.slice(0, 64));
  if (action) qs.set("action", action.slice(0, 100));
  const log = await apiGet<Page<AuditEntryView>>(`/audit-logs?${qs}`);
  const pages = Math.max(1, Math.ceil(log.total / PAGE_SIZE));
  const link = (p: number) => {
    const next = new URLSearchParams();
    if (entityId) next.set("entityId", entityId);
    if (action) next.set("action", action);
    next.set("page", String(p));
    return `/admin/audit?${next}`;
  };

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Who changed what: every desk, money, fleet, pricing and staff change, and identity checks. Newest first."
      />
      <form className="mb-6 flex flex-wrap items-end gap-3" action="/admin/audit">
        <label className="text-sm">
          <span className="mb-1 block text-ink-muted">What happened to (id)</span>
          <input
            name="entityId"
            defaultValue={entityId ?? ""}
            placeholder="A booking, settlement or user id"
            className="h-11 w-72 max-w-full rounded-control border border-line bg-surface px-3"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-muted">Action</span>
          <select name="action" defaultValue={action ?? ""} className="h-11 rounded-control border border-line bg-surface px-3">
            <option value="">Any</option>
            {Object.entries(ACTION_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-11 rounded-full bg-ink px-5 text-sm font-medium text-white hover:bg-ink/90">
          Filter
        </button>
        {(entityId || action) && (
          <Link href="/admin/audit" className="h-11 content-center text-sm underline">
            Clear
          </Link>
        )}
      </form>

      <TableWrap>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>What</Th>
            <Th>On</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody>
          {log.items.length === 0 && <EmptyRow colSpan={5}>Nothing recorded{entityId || action ? " for this filter" : " yet"}.</EmptyRow>}
          {log.items.map((e) => (
            <tr key={e.id}>
              <Td label="When" className="whitespace-nowrap">
                {formatDateTime(e.createdAt, "Asia/Kolkata")}
              </Td>
              <Td label="Who">
                {e.actor ? (
                  <>
                    <span className="font-medium">{e.actor.fullName}</span>
                    <span className="block text-xs text-ink-muted">{ROLE_LABEL[e.actor.role] ?? e.actor.role}</span>
                  </>
                ) : (
                  <span className="text-ink-muted">System</span>
                )}
              </Td>
              <Td label="What">{ACTION_LABEL[e.action] ?? e.action}</Td>
              <Td label="On">
                {e.entityId ? (
                  <Link href={`/admin/audit?entityId=${encodeURIComponent(e.entityId)}`} className="underline" title={e.entityId}>
                    {e.entityType ?? "item"} {e.entityId.slice(0, 8)}
                  </Link>
                ) : (
                  "–"
                )}
              </Td>
              <Td label="Details" className="text-ink-muted">
                {e.details && typeof e.details === "object"
                  ? Object.entries(e.details as Record<string, unknown>)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(", ")
                  : "–"}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="underline">Newer</Link> : <span />}
          <span className="text-ink-muted">
            Page {page} of {pages} ({log.total} entries)
          </span>
          {page < pages ? <Link href={link(page + 1)} className="underline">Older</Link> : <span />}
        </nav>
      )}
    </>
  );
}
