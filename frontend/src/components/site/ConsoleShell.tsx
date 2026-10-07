import Link from "next/link";
import { Building2, LayoutDashboard, MapPin, Package, Tag, Truck, User, Users, Bike } from "lucide-react";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { Wordmark } from "@/components/app/Wordmark";
import { getCurrentUser } from "@/lib/dal";
import type { Role } from "@/lib/types";
import { NavLink } from "./NavLink";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  CITY_MANAGER: "City manager",
  STATION_EMPLOYEE: "Station employee",
  CUSTOMER: "Customer",
};

/** Staff/admin console: sidebar on desktop, compact top bar with links on phones. */
export async function ConsoleShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  const manager = user?.role === "SUPER_ADMIN" || user?.role === "CITY_MANAGER";
  const links = [
    ...(manager
      ? [
          { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
          { href: "/admin/cities", label: "Cities", icon: Building2 },
          { href: "/admin/stations", label: "Stations", icon: MapPin },
          { href: "/admin/fleet", label: "Fleet", icon: Bike },
          { href: "/admin/models", label: "Vehicle models", icon: Package },
          { href: "/admin/pricing", label: "Pricing", icon: Tag },
          { href: "/admin/staff", label: "Staff", icon: Users },
        ]
      : []),
    { href: "/staff", label: "Station console", icon: Truck },
    { href: "/profile", label: "Profile", icon: User },
  ];

  const signOut = (
    <form action={logout}>
      <button
        type="submit"
        className="w-full rounded-control px-3 py-2.5 text-left text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );

  return (
    <div className="min-h-dvh bg-bg xl:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface p-4 xl:flex">
        <Link href="/" aria-label="Home" className="px-3 py-3">
          <Wordmark className="text-xl" />
        </Link>
        <nav aria-label="Console" className="mt-4 flex flex-col gap-1 overflow-y-auto">
          {links.map(({ href, label, icon: Icon, exact }) => (
            <NavLink key={href} href={href} variant="side" exact={exact}>
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          {user && (
            <div className="px-3 pb-3">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-ink-muted">{ROLE_LABEL[user.role]}</p>
            </div>
          )}
          {signOut}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-surface xl:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/" aria-label="Home">
              <Wordmark className="text-xl" />
            </Link>
            <form action={logout}>
              <button type="submit" className="rounded-full px-3 py-2 text-sm text-ink-muted">
                Sign out
              </button>
            </form>
          </div>
          <nav aria-label="Console" className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
            {links.map(({ href, label, exact }) => (
              <NavLink key={href} href={href} exact={exact}>
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8 xl:px-12 xl:py-10">{children}</main>
      </div>
    </div>
  );
}
