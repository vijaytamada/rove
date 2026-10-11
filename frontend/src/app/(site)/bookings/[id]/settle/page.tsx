import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { safeNext } from "@/lib/access";
import { requireRole } from "@/lib/dal";
import { isUuid } from "@/lib/ids";
import { apiGetMaybe } from "@/lib/server-api";
import type { BookingView } from "@/lib/types";
import { SettlePanel } from "./SettlePanel";

export const metadata = { title: "Pay what you owe" };
export const dynamic = "force-dynamic";

export default async function SettlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireRole(`/bookings/${id}/settle`, "CUSTOMER");
  const [booking, query] = await Promise.all([apiGetMaybe<BookingView>(`/bookings/${id}`), searchParams]);
  if (!booking) notFound();
  // Nothing to pay (already paid, or the ride has no balance): back to the booking.
  if (booking.settlement?.status !== "OUTSTANDING") redirect(`/bookings/${id}`);
  const next = safeNext(query.next) ?? undefined;

  return (
    <div className="mx-auto max-w-xl pb-36 md:pb-0">
      <Link href={`/bookings/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Booking {booking.code}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Pay what you owe</h1>
      <p className="mt-1.5 text-ink-muted">
        The charges for your ride were more than your deposit. Pay the difference{next ? " to book again" : ""}.
      </p>
      <div className="mt-6">
        <SettlePanel booking={booking} next={next} showDemoControls={process.env.NODE_ENV !== "production"} />
      </div>
    </div>
  );
}
