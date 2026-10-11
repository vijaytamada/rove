import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/config";
import { getCurrentUser } from "@/lib/dal";
import { getUnreadCount } from "@/lib/notifications";
import { BottomNav } from "./BottomNav";
import { DevStatus } from "./DevStatus";
import { SiteHeader } from "./SiteHeader";

/** Responsive website shell: header navigation on desktop, bottom tabs on phones. */
export async function SiteShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const unread = user?.role === "CUSTOMER" ? await getUnreadCount() : 0;
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SiteHeader user={user} unread={unread} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-14 md:pt-12 lg:px-8">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 pb-24 text-sm text-ink-muted sm:px-6 md:pb-6 lg:px-8">
          <p>© {new Date().getFullYear()} {APP_NAME}</p>
          <DevStatus />
        </div>
      </footer>
      <BottomNav />
    </div>
  );
}
