import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { isUuid } from "@/lib/ids";
import { apiGetMaybe } from "@/lib/server-api";
import type { BookingView } from "@/lib/types";
import { PayPanel } from "./PayPanel";

export const metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireRole(`/bookings/${id}/pay`, "CUSTOMER");
  const booking = await apiGetMaybe<BookingView>(`/bookings/${id}`);
  if (!booking) notFound();
  if (booking.status !== "PENDING_PAYMENT") redirect(`/bookings/${id}`);

  return (
    <div className="mx-auto max-w-xl pb-36 md:pb-0">
      <Link href={`/bookings/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Booking {booking.code}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Pay to confirm</h1>
      <p className="mt-1.5 text-ink-muted">We&apos;re holding this scooter for you. Pay before the timer ends.</p>
      <div className="mt-6">
        <PayPanel booking={booking} showDemoControls={process.env.NODE_ENV !== "production"} />
      </div>
    </div>
  );
}
