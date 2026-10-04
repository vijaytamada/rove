"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Props {
  href: string;
  children: ReactNode;
  /** "top" = header pill, "side" = sidebar row. */
  variant?: "top" | "side";
  /** Match only this exact path (use for "/"). */
  exact?: boolean;
}

export function NavLink({ href, children, variant = "top", exact }: Props) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const base =
    variant === "top"
      ? "shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm"
      : "flex items-center gap-2 rounded-control px-3 py-2.5 text-sm";
  const state = active ? "bg-canvas font-medium text-ink" : "text-ink-muted hover:bg-canvas hover:text-ink";
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${base} ${state}`}>
      {children}
    </Link>
  );
}
