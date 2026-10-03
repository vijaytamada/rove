import { Home, Receipt, User } from "lucide-react";

// Phase 1: only Home exists. Bookings (Phase 4) and Profile (Phase 2) are placeholders.
const tabs = [
  { label: "Home", icon: Home, active: true },
  { label: "Bookings", icon: Receipt, active: false },
  { label: "Profile", icon: User, active: false },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[480px] justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pt-2"
    >
      {tabs.map(({ label, icon: Icon, active }) => (
        <span
          key={label}
          aria-current={active ? "page" : undefined}
          aria-disabled={!active}
          className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 text-xs ${
            active ? "text-accent" : "text-ink-faint"
          }`}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </span>
      ))}
    </nav>
  );
}
