import { apiRequest } from "./api";
import { getAccessToken } from "./session";

/** How many messages a customer has not read. 0 when signed out or if the backend is unavailable (the bell just shows no badge). */
export async function getUnreadCount(): Promise<number> {
  const token = await getAccessToken();
  if (!token) return 0;
  const res = await apiRequest<{ count: number }>("/notifications/unread-count", { token });
  return res.ok ? res.data.count : 0;
}
