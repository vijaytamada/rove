"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

/** Primary = solid ink pill (one per screen). Secondary = outline. Shows progress while submitting. */
export function SubmitButton({ variant = "primary", children, className = "", ...rest }: Props) {
  const { pending } = useFormStatus();
  const style =
    variant === "primary"
      ? "bg-ink text-white hover:bg-ink/90"
      : "border border-line bg-surface text-ink hover:bg-canvas";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`h-12 w-full rounded-full text-base font-medium transition-colors disabled:opacity-60 ${style} ${className}`}
      {...rest}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
