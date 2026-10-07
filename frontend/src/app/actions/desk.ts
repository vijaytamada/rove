"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiRequest, type ApiResult } from "@/lib/api";
import { failure, num, optional, paise, text, valuesOf, type FormState } from "@/lib/form";
import { getAccessToken } from "@/lib/session";
import type { StaffBookingView } from "@/lib/types";

async function token(id: string) {
  const t = await getAccessToken();
  if (!t) redirect(`/login/staff?next=${encodeURIComponent(`/staff/bookings/${id}`)}`);
  return t;
}

/** Maps the desk's API errors onto the field they are about; everything else becomes a form message. */
function deskFailure(res: Extract<ApiResult<unknown>, { ok: false }>, form: FormData): FormState {
  const byCode: Record<string, string> = {
    PIN_INVALID: "pin",
    ODOMETER_BEHIND: form.has("startOdometerKm") ? "startOdometerKm" : "endOdometerKm",
    ODOMETER_TOO_FAR: "endOdometerKm",
    SWAP_REASON_REQUIRED: "swapReason",
    REPLACEMENT_NOT_AVAILABLE: "replacementVehicleId",
  };
  const base = byCode[res.code] ? { fieldErrors: { [byCode[res.code]]: res.message } } : failure(res);
  return { ...base, values: valuesOf(form, ["password", "pin"]) };
}

/** One optional damage note typed on the form (more can be added later by staff on the next step). */
function damageFrom(form: FormData, withFee: boolean) {
  const description = text(form, "damageNote");
  if (!description) return undefined;
  return [
    {
      description,
      severity: text(form, "damageSeverity") || "MINOR",
      ...(withFee && { feeAmount: paise(form, "damageFee") ?? 0 }),
    },
  ];
}

function done(id: string, what: string): never {
  revalidatePath("/staff");
  revalidatePath(`/staff/bookings/${id}`);
  redirect(`/staff/bookings/${id}?done=${what}`);
}

export async function pickupAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const replacement = optional(form, "replacementVehicleId");
  const res = await apiRequest<StaffBookingView>(`/station/bookings/${id}/pickup`, {
    token: await token(id),
    body: {
      pin: text(form, "pin").replace(/\s/g, ""),
      idChecked: form.get("idChecked") === "on",
      startOdometerKm: num(form, "startOdometerKm"),
      startBatteryPercent: num(form, "startBatteryPercent"),
      replacementVehicleId: replacement,
      swapReason: replacement ? optional(form, "swapReason") : undefined,
      damages: damageFrom(form, false),
    },
  });
  if (!res.ok) return deskFailure(res, form);
  return done(id, "pickup");
}

export async function returnAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const res = await apiRequest<StaffBookingView>(`/station/bookings/${id}/return`, {
    token: await token(id),
    body: {
      returnStationId: text(form, "returnStationId"),
      endOdometerKm: num(form, "endOdometerKm"),
      endBatteryPercent: num(form, "endBatteryPercent"),
      damages: damageFrom(form, true),
      sendToMaintenance: form.get("sendToMaintenance") === "on",
    },
  });
  if (!res.ok) return deskFailure(res, form);
  return done(id, "return");
}

export async function noShowAction(id: string): Promise<FormState> {
  const res = await apiRequest<StaffBookingView>(`/station/bookings/${id}/no-show`, { method: "POST", body: {}, token: await token(id) });
  if (!res.ok) return { error: res.message };
  return done(id, "no-show");
}
