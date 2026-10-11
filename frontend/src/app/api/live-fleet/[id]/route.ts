import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/api";
import { isUuid } from "@/lib/ids";
import { getAccessToken } from "@/lib/session";
import type { TelemetryTrail } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The recent path of one scooter for the map (default: the last 30 minutes). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ code: "VEHICLE_NOT_FOUND" }, { status: 404 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const res = await apiRequest<TelemetryTrail>(`/vehicles/${id}/telemetry`, { token });
  if (res.ok) return NextResponse.json(res.data, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ code: res.code, message: res.message }, { status: res.status === 0 ? 502 : res.status });
}
