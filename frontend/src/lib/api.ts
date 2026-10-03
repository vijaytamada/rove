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

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; details?: string[] };

/** Server-side call to the backend API. Never throws; network failures become `NETWORK_ERROR`. */
export async function apiRequest<T = void>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "PUT"; body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      cache: "no-store",
      headers: {
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
        ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    if (res.ok) {
      const text = await res.text();
      return { ok: true, data: (text ? JSON.parse(text) : undefined) as T };
    }
    const err = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
      details?: string[];
    };
    return {
      ok: false,
      status: res.status,
      code: err.code ?? "ERROR",
      message: err.message ?? "Something went wrong. Try again.",
      details: Array.isArray(err.details) ? err.details : undefined,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: "Can't reach the server. Check your connection and try again.",
    };
  }
}
