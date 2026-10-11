import Link from "next/link";
import { Bell } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Wordmark } from "@/components/app/Wordmark";
import { homeFor } from "@/lib/access";
import type { UserView } from "@/lib/types";
import { NavLink } from "./NavLink";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function SiteHeader({ user, unread = 0 }: { user: UserView | null; unread?: number }) {
  const consoleHref = user && user.role !== "CUSTOMER" ? homeFor(user.role) : null;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 md:h-16 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Home">
            <Wordmark className="text-xl" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <NavLink href="/" exact>
              Home
            </NavLink>
            <NavLink href="/stations">Stations</NavLink>
            {user?.role === "CUSTOMER" && <NavLink href="/bookings">Bookings</NavLink>}
            {user && <NavLink href="/profile">Profile</NavLink>}
            {consoleHref && (
              <NavLink href={consoleHref}>{user?.role === "STATION_EMPLOYEE" ? "Station desk" : "Admin"}</NavLink>
            )}
          </nav>
        </div>

        {user ? (
          <div className="flex items-center gap-1 md:gap-3">
            {user.role === "CUSTOMER" && (
              <Link
                href="/notifications"
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
                className="relative flex size-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
                {unread > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            )}
            <Link
              href="/profile"
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 hover:bg-canvas md:pr-3"
              aria-label="Your profile"
            >
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-white"
              >
                {initials(user.fullName)}
              </span>
              <span className="hidden text-sm font-medium md:block">{user.fullName.split(" ")[0]}</span>
            </Link>
            <form action={logout} className="hidden md:block">
              <button
                type="submit"
                className="rounded-full px-3.5 py-2 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:bg-canvas"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="hidden rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/90 sm:block"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
