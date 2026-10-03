import Link from "next/link";
import { Home, Receipt, User } from "lucide-react";

type Tab = "home" | "bookings" | "profile";

// Bookings is a placeholder until Phase 4.
const tabs = [
  { id: "home", label: "Home", icon: Home, href: "/" },
  { id: "bookings", label: "Bookings", icon: Receipt, href: null },
  { id: "profile", label: "Profile", icon: User, href: "/profile" },
] as const;

export function BottomNav({ active }: { active: Tab }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[480px] justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pt-2"
    >
      {tabs.map(({ id, label, icon: Icon, href }) => {
        const classes = `flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 text-xs ${
          active === id ? "text-accent" : href ? "text-ink-muted" : "text-ink-faint"
        }`;
        const content = (
          <>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </>
        );
        return href ? (
          <Link key={id} href={href} aria-current={active === id ? "page" : undefined} className={classes}>
            {content}
          </Link>
        ) : (
          <span key={id} aria-disabled="true" className={classes}>
            {content}
          </span>
        );
      })}
    </nav>
  );
}
