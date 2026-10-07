import type { ReactNode } from "react";

/**
 * Price + main button. A bar fixed to the bottom on phones (the tab bar is hidden on checkout pages),
 * and a normal card on wider screens.
 */
export function StickyCta({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:static md:mt-6 md:rounded-card md:border md:p-5">
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
