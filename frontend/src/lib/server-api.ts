import { redirect } from "next/navigation";
import { apiRequest } from "./api";
import { getAccessToken } from "./session";
import type { Page } from "./types";

/**
 * Authenticated GET from a server component. Signed-out users go to sign-in, users without
 * access go home; anything else surfaces through the error boundary.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) redirect("/login");
  const res = await apiRequest<T>(path, { token });
  if (res.ok) return res.data;
  if (res.status === 401) redirect("/login");
  if (res.status === 403) redirect("/");
  throw new Error(res.message);
}

/** Fetches every page of a list endpoint (max 100 per page), for pickers and small tables. */
export async function apiGetAll<T>(path: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const first = await apiGet<Page<T>>(`${path}${sep}limit=100&page=1`);
  const items = [...first.items];
  for (let page = 2; items.length < first.total && page <= 20; page++) {
    items.push(...(await apiGet<Page<T>>(`${path}${sep}limit=100&page=${page}`)).items);
  }
  return items;
}

/** Staff accounts the signed-in user can manage (never customers). Admins: all staff roles; managers: their employees. */
export async function getStaff(role: string): Promise<import("./types").UserView[]> {
  if (role !== "SUPER_ADMIN") return apiGetAll<import("./types").UserView>("/users");
  const groups = await Promise.all(
    ["SUPER_ADMIN", "CITY_MANAGER", "STATION_EMPLOYEE"].map((r) => apiGetAll<import("./types").UserView>(`/users?role=${r}`)),
  );
  return groups.flat();
}

/** Like apiGet, but a missing or foreign record (404) comes back as null so the page can show "not found". */
export async function apiGetMaybe<T>(path: string): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) redirect("/login");
  const res = await apiRequest<T>(path, { token });
  if (res.ok) return res.data;
  if (res.status === 404) return null;
  if (res.status === 401) redirect("/login");
  if (res.status === 403) redirect("/");
  throw new Error(res.message);
}
