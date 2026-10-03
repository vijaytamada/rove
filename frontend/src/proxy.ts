import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PAGES, homeFor, loginPathFor, ruleFor } from "@/lib/access";
import { API_URL } from "@/lib/config";
import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_MAX_AGE, cookieOptions } from "@/lib/cookie-config";
import type { AuthResult, Role } from "@/lib/types";

interface Claims {
  role: Role;
  exp: number;
}

/** Reads the access token's claims WITHOUT verifying it. Optimistic only: the backend verifies. */
function readClaims(token: string | undefined): Claims | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload)) as Claims;
    return claims.exp * 1000 > Date.now() + 5_000 ? claims : null;
  } catch {
    return null;
  }
}

async function refresh(refreshToken: string): Promise<AuthResult | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as AuthResult) : null;
  } catch {
    return null;
  }
}

/**
 * 1) Renews an expired access token using the refresh cookie (so pages always see a valid session).
 * 2) Redirects signed-out visitors away from protected pages and wrong-role users to their home.
 * This is a convenience layer; pages and the API enforce access again.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  let claims = readClaims(access);
  let renewed: AuthResult | null = null;

  if (!claims && refreshToken) {
    renewed = await refresh(refreshToken);
    if (renewed) {
      access = renewed.accessToken;
      claims = readClaims(access);
    }
    // On failure cookies are left alone: a parallel request may have just renewed them.
  }

  const rule = ruleFor(pathname);
  let response: NextResponse;

  if (rule && !claims) {
    const url = new URL(loginPathFor(pathname), request.url);
    url.searchParams.set("next", pathname);
    response = NextResponse.redirect(url);
  } else if (rule?.roles && claims && !rule.roles.includes(claims.role)) {
    response = NextResponse.redirect(new URL(homeFor(claims.role), request.url));
  } else if (AUTH_PAGES.includes(pathname) && claims) {
    response = NextResponse.redirect(new URL(homeFor(claims.role), request.url));
  } else if (renewed) {
    // Let the rest of this request see the new access token.
    const headers = new Headers(request.headers);
    const cookies = request.cookies
      .getAll()
      .filter((c) => c.name !== ACCESS_COOKIE && c.name !== REFRESH_COOKIE)
      .map((c) => `${c.name}=${c.value}`);
    cookies.push(`${ACCESS_COOKIE}=${renewed.accessToken}`, `${REFRESH_COOKIE}=${renewed.refreshToken}`);
    headers.set("cookie", cookies.join("; "));
    response = NextResponse.next({ request: { headers } });
  } else {
    response = NextResponse.next();
  }

  if (renewed) {
    response.cookies.set(ACCESS_COOKIE, renewed.accessToken, { ...cookieOptions, maxAge: renewed.expiresIn });
    response.cookies.set(REFRESH_COOKIE, renewed.refreshToken, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
  }
  return response;
}

export const config = {
  // Run on pages only (skip Next internals, static files and the PWA manifest).
  matcher: ["/((?!_next/|api/|.*\\..*|manifest.webmanifest).*)"],
};
