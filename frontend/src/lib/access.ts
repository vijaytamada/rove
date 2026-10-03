import type { Role } from "./types";

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "CITY_MANAGER":
      return "/admin";
    case "STATION_EMPLOYEE":
      return "/staff";
    default:
      return "/";
  }
}

/**
 * Route access rules, shared by the proxy (optimistic redirect) and pages (real check).
 * `roles: undefined` means any signed-in user. The backend enforces the same rules on the API.
 */
export const ROUTE_RULES: { prefix: string; roles?: Role[] }[] = [
  { prefix: "/profile" },
  { prefix: "/staff", roles: ["STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN"] },
  { prefix: "/admin", roles: ["CITY_MANAGER", "SUPER_ADMIN"] },
];

export const AUTH_PAGES = ["/login", "/login/staff", "/register"];

/** Console routes send signed-out visitors to the staff form; everything else to the customer form. */
export function loginPathFor(pathname: string): string {
  const staffArea = ["/staff", "/admin"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return staffArea ? "/login/staff" : "/login";
}

export function ruleFor(pathname: string) {
  return ROUTE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
}

/** Only allow same-site relative paths as post-login redirects. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
