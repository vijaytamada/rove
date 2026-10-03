import { cache } from "react";
import { redirect } from "next/navigation";
import { apiRequest } from "./api";
import { homeFor, loginPathFor } from "./access";
import { getAccessToken } from "./session";
import type { Role, UserView } from "./types";

/** The signed-in user (verified by the backend), or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<UserView | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await apiRequest<UserView>("/me", { token });
  return res.ok ? res.data : null;
});

/** For pages: redirects to sign-in when signed out. */
export async function requireUser(returnTo: string): Promise<UserView> {
  const user = await getCurrentUser();
  if (!user) redirect(`${loginPathFor(returnTo)}?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** For pages: signed in and one of the allowed roles, else sent to their own home. */
export async function requireRole(returnTo: string, ...roles: Role[]): Promise<UserView> {
  const user = await requireUser(returnTo);
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
