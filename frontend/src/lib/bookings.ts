import { apiRequest } from "./api";
import { getAccessToken } from "./session";
import type { BookingView, KycView, Page } from "./types";

/** The booking a customer most likely cares about right now: something active, else the next one. Null if none. */
export async function getNextBooking(): Promise<BookingView | null> {
  const token = await getAccessToken();
  if (!token) return null;
  for (const tab of ["active", "upcoming"]) {
    const res = await apiRequest<Page<BookingView>>(`/bookings?tab=${tab}&limit=1`, { token });
    if (res.ok && res.data.items[0]) return res.data.items[0];
  }
  return null;
}

export async function getKyc(): Promise<KycView | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await apiRequest<KycView>("/kyc/status", { token });
  return res.ok ? res.data : null;
}
