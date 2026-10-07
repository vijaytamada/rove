import { StatusChip } from "@/components/app/StatusChip";
import type { BookingStatus } from "@/lib/types";

const TONE: Record<BookingStatus, "success" | "warning" | "danger" | "muted"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  IN_RIDE: "success",
  RETURNED: "success",
  SETTLED: "success",
  CANCELLED: "muted",
  EXPIRED: "muted",
  NO_SHOW: "danger",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "Waiting for payment",
  CONFIRMED: "Confirmed",
  IN_RIDE: "In ride",
  RETURNED: "Returned",
  SETTLED: "Settled",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  NO_SHOW: "No show",
};

export const BookingStatusChip = ({ status }: { status: BookingStatus }) => (
  <StatusChip tone={TONE[status]}>{BOOKING_STATUS_LABEL[status]}</StatusChip>
);
