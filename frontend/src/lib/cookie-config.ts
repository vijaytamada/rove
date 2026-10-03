// Shared by the proxy and server actions. No `next/headers` import, so it is safe in the proxy.
export const ACCESS_COOKIE = "rove_at";
export const REFRESH_COOKIE = "rove_rt";
// Matches the backend default (REFRESH_TOKEN_TTL_DAYS=30). The backend remains the authority.
export const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

// Tokens live in httpOnly cookies, so browser JavaScript can never read them.
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
