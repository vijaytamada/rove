import { apiRequest } from "./api";
import { getAccessToken } from "./session";
import type { CustomerDashboard, KycView } from "./types";

/** A customer's home: what needs attention, what is next, recent rides, what they owe. Null when signed out or unavailable. */
export async function getCustomerDashboard(): Promise<CustomerDashboard | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await apiRequest<CustomerDashboard>("/dashboard/customer", { token });
  return res.ok ? res.data : null;
}

export async function getKyc(): Promise<KycView | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await apiRequest<KycView>("/kyc/status", { token });
  return res.ok ? res.data : null;
}
