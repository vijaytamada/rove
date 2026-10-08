import Link from "next/link";
import { EmptyRow, PageHeader, TableWrap, Td, Th } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { formatDateTime, formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { apiGet } from "@/lib/server-api";
import type { Page, SettlementStatus, StaffSettlementView } from "@/lib/types";

export const metadata = { title: "Settlements" };
export const dynamic = "force-dynamic";

const TABS: { id: string; status: SettlementStatus; label: string; empty: string; amount: "outstanding" | "refund" }[] = [
  { id: "owed", status: "OUTSTANDING", label: "Owed", empty: "Nobody owes anything right now.", amount: "outstanding" },
  { id: "refunds", status: "REFUND_PENDING", label: "Refunds waiting", empty: "No refunds are waiting to go through.", amount: "refund" },
  { id: "paid", status: "CLEARED", label: "Paid", empty: "No amounts have been paid yet.", amount: "outstanding" },
];

export default async function Settlements({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole("/staff/settlements", "STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN");
  const { tab: tabId } = await searchParams;
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]!;
  const result = await apiGet<Page<StaffSettlementView>>(`/settlements?${new URLSearchParams({ status: tab.status, limit: "50" })}`);

  return (
    <>
      <PageHeader title="Settlements" description="Money still owed by customers, and refunds that did not go through." />

      <nav aria-label="Settlements" className="mb-6 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/staff/settlements?tab=${t.id}`}
            aria-current={t.id === tab.id ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              t.id === tab.id ? "bg-ink text-white" : "border border-line bg-surface hover:bg-canvas"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <TableWrap>
        <thead>
          <tr>
            <Th>Booking</Th>
            <Th>Customer</Th>
            <Th>Returned</Th>
            <Th>{tab.amount === "refund" ? "Refund" : "Amount"}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 && <EmptyRow colSpan={5}>{tab.empty}</EmptyRow>}
          {result.items.map((s) => (
            <tr key={s.id}>
              <Td label="Booking" className="font-mono font-medium">
                {s.booking.code}
                <span className="block font-sans text-xs font-normal text-ink-muted">
                  {s.booking.vehicleCode} · {s.booking.stationName}
                </span>
              </Td>
              <Td label="Customer">
                <p className="font-medium">{s.booking.customer.fullName}</p>
                <p className="text-xs text-ink-muted">{s.booking.customer.phone ? formatPhone(s.booking.customer.phone) : "No phone"}</p>
              </Td>
              <Td label="Returned">
                {s.booking.returnedAt ? formatDateTime(s.booking.returnedAt, s.booking.timezone) : "–"}
                {s.booking.returnStationName && <span className="block text-xs text-ink-muted">{s.booking.returnStationName}</span>}
              </Td>
              <Td label={tab.amount === "refund" ? "Refund" : "Amount"} className="font-medium">
                {formatMoney(tab.amount === "refund" ? s.refundAmount : s.outstandingAmount)}
              </Td>
              <Td className="text-right">
                <Link
                  href={`/staff/bookings/${s.booking.id}`}
                  className="inline-flex rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-canvas"
                >
                  Open
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
