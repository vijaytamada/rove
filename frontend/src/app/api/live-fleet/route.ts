import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import type { LiveFleet } from "@/lib/types";

/**
 * The live map polls this. It forwards the signed-in user's own token to the backend (which decides what they may see),
 * so the browser never holds the token. Route handlers skip the proxy that renews tokens, so an expired session answers
 * 401 and the map asks the page to reload (which renews it).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const res = await apiRequest<LiveFleet>("/fleet/live", { token });
  if (res.ok) return NextResponse.json(res.data, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ code: res.code, message: res.message }, { status: res.status === 0 ? 502 : res.status });
}
