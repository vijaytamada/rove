import Link from "next/link";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import { requireRole } from "@/lib/dal";
import { formatAgo } from "@/lib/format";
import { apiGet } from "@/lib/server-api";
import type { NotificationView, Page } from "@/lib/types";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireRole("/notifications", "CUSTOMER");
  const inbox = await apiGet<Page<NotificationView>>("/notifications?limit=50");
  const unread = inbox.items.filter((n) => !n.readAt).length;
  const now = new Date();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Notifications</h1>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              Mark all as read
            </button>
          </form>
        )}
      </div>

      {inbox.items.length === 0 ? (
        <div className="mt-8 rounded-card border border-line bg-surface p-8 text-center">
          <p className="text-ink-muted">Nothing yet. Updates about your bookings and rides show up here.</p>
          <Link href="/stations" className="mt-4 inline-block text-sm font-medium underline">
            Find a scooter
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {inbox.items.map((n) => (
            <li
              key={n.id}
              className={`rounded-card border p-4 sm:p-5 ${n.readAt ? "border-line bg-surface" : "border-accent/30 bg-accent/5"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  {!n.readAt && <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-accent" />}
                  {n.title}
                </h2>
                <time dateTime={n.createdAt} className="shrink-0 text-xs text-ink-muted">
                  {formatAgo(n.createdAt, now)}
                </time>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{n.body}</p>
              <div className="mt-3 flex items-center gap-4 text-sm">
                {n.bookingId && (
                  <Link href={`/bookings/${n.bookingId}`} className="font-medium underline">
                    View booking
                  </Link>
                )}
                {!n.readAt && (
                  <form action={markNotificationRead.bind(null, n.id)}>
                    <button type="submit" className="text-ink-muted hover:text-ink">
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {inbox.total > inbox.items.length && (
        <p className="mt-4 text-center text-xs text-ink-muted">
          Showing the latest {inbox.items.length} of {inbox.total}.
        </p>
      )}
    </div>
  );
}
