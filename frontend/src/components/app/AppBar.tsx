import type { ReactNode } from "react";

export function AppBar({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-bg/90 px-5 backdrop-blur">
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}
