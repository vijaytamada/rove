import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { formatMoney, formatRange } from "@/lib/format";
import type { BookingView } from "@/lib/types";
import { BookingStatusChip } from "./BookingStatusChip";

export function BookingCard({ booking: b }: { booking: BookingView }) {
  const { model } = b.vehicle;
  return (
    <Link
      href={`/bookings/${b.id}`}
      className="group block rounded-card border border-line bg-surface p-5 transition-colors hover:border-ink/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">
            {model.brand} {model.name}
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">{b.code}</p>
        </div>
        <BookingStatusChip status={b.status} />
      </div>
      <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
        <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
        {b.station.name}
      </p>
      <p className="mt-1.5 text-sm">{formatRange(b.startAt, b.endAt, b.station.timezone)}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-base font-semibold">{formatMoney(b.totalAmount)}</span>
        <span className="flex items-center gap-1 text-sm font-medium text-ink group-hover:underline">
          {b.status === "PENDING_PAYMENT" ? "Pay now" : "View"}
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
