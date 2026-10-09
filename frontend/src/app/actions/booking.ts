"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeNext } from "@/lib/access";
import { apiRequest } from "@/lib/api";
import { failure, num, text, type FormState } from "@/lib/form";
import { localToUtcIso } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getAccessToken } from "@/lib/session";
import type { BookingView, KycView, QuoteView, SettlementView } from "@/lib/types";

/** Where a customer returns to after signing in or verifying: the booking page with their choices kept. */
function bookingPath(vehicleId: string, hours: number | undefined, startLocal: string) {
  const qs = new URLSearchParams();
  if (hours) qs.set("hours", String(hours));
  if (startLocal) qs.set("start", startLocal);
  const query = qs.toString();
  return `/book/${vehicleId}${query ? `?${query}` : ""}`;
}

/** A wall-clock time typed by the customer, read on the station's clock. Empty = start now. */
function startAtFor(startLocal: string, timeZone: string): string | undefined | null {
  if (!startLocal) return undefined;
  try {
    return localToUtcIso(startLocal, timeZone);
  } catch {
    return null;
  }
}

export type QuoteResult = { ok: true; quote: QuoteView } | { ok: false; error: string };

/** Live price for the booking page. The backend decides every amount; this only relays it. */
export async function getQuote(vehicleId: string, startLocal: string, timeZone: string, hours: number): Promise<QuoteResult> {
  if (!isUuid(vehicleId)) return { ok: false, error: "Scooter not found." };
  const startAt = startAtFor(startLocal, timeZone);
  if (startAt === null) return { ok: false, error: "Choose a valid start time." };
  const res = await apiRequest<QuoteView>("/bookings/quote", { body: { vehicleId, hours, startAt } });
  return res.ok ? { ok: true, quote: res.data } : { ok: false, error: res.message };
}

/** "Continue" on the booking page: hold the scooter, then go and pay. */
export async function createBooking(_prev: FormState, form: FormData): Promise<FormState> {
  const vehicleId = text(form, "vehicleId");
  if (!isUuid(vehicleId)) return { error: "Scooter not found." };
  const hours = num(form, "hours");
  const startLocal = text(form, "startLocal");
  const returnTo = bookingPath(vehicleId, hours, startLocal);

  const token = await getAccessToken();
  if (!token) redirect(`/login?next=${encodeURIComponent(returnTo)}`);

  const startAt = startAtFor(startLocal, text(form, "timeZone"));
  if (startAt === null) return { error: "Choose a valid start time." };

  const res = await apiRequest<BookingView>("/bookings", { body: { vehicleId, hours, startAt }, token });
  if (!res.ok) {
    if (res.code === "KYC_REQUIRED") redirect(`/verify?next=${encodeURIComponent(returnTo)}`);
    // Money is owed for an earlier ride: send the customer to pay it, then they can book again.
    const owed = res.code === "OUTSTANDING_BALANCE" ? res.info?.bookingId : undefined;
    if (typeof owed === "string" && isUuid(owed)) redirect(`/bookings/${owed}/settle?next=${encodeURIComponent(returnTo)}`);
    return failure(res);
  }
  revalidatePath("/bookings");
  redirect(`/bookings/${res.data.id}/pay`);
}

/** Demo checkout. Each tap is its own attempt; the backend refuses a second payment while one is running. */
export async function payBooking(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const token = await getAccessToken();
  if (!token) redirect(`/login?next=${encodeURIComponent(`/bookings/${id}/pay`)}`);

  const res = await apiRequest<BookingView>(`/bookings/${id}/pay`, {
    method: "POST",
    body: form.get("simulate") === "FAIL" && process.env.NODE_ENV !== "production" ? { simulate: "FAIL" } : {},
    headers: { "Idempotency-Key": randomUUID() },
    token,
  });
  if (!res.ok) {
    // The hold ran out: tell the page, so it can offer to book again instead of another try.
    return { error: res.message, values: { code: res.code } };
  }
  revalidatePath("/bookings");
  redirect(`/bookings/${id}?confirmed=1`);
}

/** Demo payment of what a customer owes after a ride (charges beyond the deposit). */
export async function paySettlement(bookingId: string, next: string | undefined, _prev: FormState, form: FormData): Promise<FormState> {
  const token = await getAccessToken();
  if (!token) redirect(`/login?next=${encodeURIComponent(`/bookings/${bookingId}/settle`)}`);
  const res = await apiRequest<SettlementView>(`/bookings/${bookingId}/settlement/pay`, {
    method: "POST",
    body: form.get("simulate") === "FAIL" && process.env.NODE_ENV !== "production" ? { simulate: "FAIL" } : {},
    headers: { "Idempotency-Key": randomUUID() },
    token,
  });
  if (!res.ok) return { error: res.message };
  revalidatePath("/bookings");
  redirect(safeNext(next) ?? `/bookings/${bookingId}?paid=1`);
}

export async function cancelBooking(id: string): Promise<FormState> {
  const token = await getAccessToken();
  if (!token) redirect(`/login?next=${encodeURIComponent(`/bookings/${id}`)}`);
  const res = await apiRequest<BookingView>(`/bookings/${id}/cancel`, { method: "POST", body: {}, token });
  if (!res.ok) return failure(res);
  revalidatePath("/bookings");
  redirect(`/bookings/${id}?cancelled=1`);
}

/** Mock identity check: agree, and it is verified straight away. */
export async function startKyc(_prev: FormState, form: FormData): Promise<FormState> {
  const next = safeNext(text(form, "next")) ?? "/bookings";
  const token = await getAccessToken();
  if (!token) redirect(`/login?next=${encodeURIComponent(`/verify?next=${encodeURIComponent(next)}`)}`);
  if (form.get("consent") !== "on") return { fieldErrors: { consent: "Please agree to continue." } };

  const res = await apiRequest<KycView>("/kyc/start", { body: { consent: true }, token });
  if (!res.ok) return failure(res);
  if (res.data.status === "REJECTED") return { error: res.data.rejectionReason ?? "We couldn't verify your identity." };
  revalidatePath("/", "layout");
  redirect(next);
}
