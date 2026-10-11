"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { isUuid } from "@/lib/ids";
import { getAccessToken } from "@/lib/session";

/** Marks one message as read and refreshes the page and the bell. */
export async function markNotificationRead(id: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) redirect("/login?next=%2Fnotifications");
  if (!isUuid(id)) return;
  await apiRequest(`/notifications/${id}/read`, { method: "POST", body: {}, token });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const token = await getAccessToken();
  if (!token) redirect("/login?next=%2Fnotifications");
  await apiRequest("/notifications/read-all", { method: "POST", body: {}, token });
  revalidatePath("/", "layout");
}
