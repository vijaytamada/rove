"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when something unexpected fails while rendering a page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Real error tracking arrives with monitoring in Phase 12; for now keep it in the console.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-ink-muted">We couldn&apos;t load this page. Try again, or go back to the start.</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="h-12 flex-1 rounded-full bg-ink text-base font-medium text-white transition-colors hover:bg-ink/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="flex h-12 flex-1 items-center justify-center rounded-full border border-line bg-surface text-base font-medium transition-colors hover:bg-canvas"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
