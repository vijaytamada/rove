"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The current time in ms, refreshed every `intervalMs` (default 1 second), or null during server rendering and
 * the first paint so the server and the browser never disagree about what time it is.
 */
export function useNow(intervalMs = 1000): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const timer = setInterval(onChange, intervalMs);
      return () => clearInterval(timer);
    },
    [intervalMs],
  );
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  );
}
