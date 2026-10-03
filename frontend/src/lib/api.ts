import { API_URL } from "./config";

export type CheckStatus = "up" | "down";

export interface HealthReport {
  status: "ok" | "degraded";
  checks: { database: CheckStatus; redis: CheckStatus };
  uptimeSeconds: number;
  timestamp: string;
}

/** Returns null when the backend is unreachable. */
export async function getHealth(): Promise<HealthReport | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthReport;
  } catch {
    return null;
  }
}
