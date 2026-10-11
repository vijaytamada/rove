"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While the provider is still checking, asks the page for fresh data every few seconds so it flips on its own. */
export function PendingRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return <p className="sr-only" role="status">Checking…</p>;
}
