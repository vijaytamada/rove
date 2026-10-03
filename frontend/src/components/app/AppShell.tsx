import type { ReactNode } from "react";

/** Mobile-first app column. On desktop it stays a centered ~480px column. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-bg md:border-x md:border-line">
        {children}
      </div>
    </div>
  );
}
