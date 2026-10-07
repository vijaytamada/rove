"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, Ticket, User } from "lucide-react";

// Phones only (hidden from md up, where the header navigation is used).
const tabs = [
  { label: "Home", icon: Home, href: "/", exact: true },
  { label: "Stations", icon: MapPin, href: "/stations", exact: false },
  { label: "Bookings", icon: Ticket, href: "/bookings", exact: false },
  { label: "Profile", icon: User, href: "/profile", exact: false },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  // Checkout pages have their own bottom bar (price + button); the tabs would cover it.
  if (pathname.startsWith("/book/") || /^\/bookings\/[^/]+\/pay$/.test(pathname)) return null;
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pt-2 md:hidden"
    >
      {tabs.map(({ label, icon: Icon, href, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-0.5 text-xs ${
              active ? "text-accent" : "text-ink-muted"
            }`}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
