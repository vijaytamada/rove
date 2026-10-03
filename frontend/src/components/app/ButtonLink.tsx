import Link from "next/link";
import type { ReactNode } from "react";

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const style =
    variant === "primary"
      ? "bg-ink text-white hover:bg-ink/90"
      : "border border-line bg-surface text-ink hover:bg-canvas";
  return (
    <Link
      href={href}
      className={`flex h-12 w-full items-center justify-center rounded-full text-base font-medium transition-colors ${style}`}
    >
      {children}
    </Link>
  );
}
