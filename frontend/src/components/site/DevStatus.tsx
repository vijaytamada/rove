import { StatusChip } from "@/components/app/StatusChip";
import { getHealth } from "@/lib/api";

/** Development-only backend diagnostics. Renders nothing in production. */
export async function DevStatus() {
  if (process.env.NODE_ENV === "production") return null;
  const health = await getHealth();

  const chip = (label: string, status: "up" | "down" | undefined) => (
    <span className="flex items-center gap-1.5">
      <span className="text-ink-muted">{label}</span>
      <StatusChip tone={status === "up" ? "success" : status === "down" ? "danger" : "muted"}>
        {status === "up" ? "Up" : status === "down" ? "Down" : "Unknown"}
      </StatusChip>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span className="font-medium text-ink-muted">Dev status</span>
      {chip("API", health ? "up" : "down")}
      {chip("Database", health?.checks.database)}
      {chip("Redis", health?.checks.redis)}
    </div>
  );
}
