import Link from "next/link";
import type { DashboardRange } from "@/lib/types";

export const RANGES: { key: DashboardRange; label: string; long: string }[] = [
  { key: "1d", label: "24 hours", long: "the last 24 hours" },
  { key: "7d", label: "7 days", long: "the last 7 days" },
  { key: "30d", label: "30 days", long: "the last 30 days" },
];

/** Reads ?range= safely: anything else is the 7 day default. */
export const parseRange = (value: string | undefined): DashboardRange => RANGES.find((r) => r.key === value)?.key ?? "7d";
export const rangeLabel = (key: DashboardRange) => RANGES.find((r) => r.key === key)?.long ?? "the last 7 days";

/** Switches the time window the activity and money numbers cover. Other query values (like a city) are kept. */
export function RangeTabs({ current, basePath, keep = {} }: { current: DashboardRange; basePath: string; keep?: Record<string, string> }) {
  return (
    <nav aria-label="Time range" className="flex gap-2 overflow-x-auto">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`${basePath}?${new URLSearchParams({ ...keep, range: r.key })}`}
          aria-current={r.key === current ? "page" : undefined}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            r.key === current ? "bg-ink text-white" : "border border-line bg-surface hover:bg-canvas"
          }`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
