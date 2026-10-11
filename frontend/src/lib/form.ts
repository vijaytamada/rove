import type { ApiResult } from "./api";

export interface FormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values (never passwords) so a failed submit does not clear the form. */
  values?: Record<string, string>;
}

export const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
export const optional = (form: FormData, name: string) => text(form, name) || undefined;
/** Phone numbers: strip spaces, empty = undefined. */
export const phone = (form: FormData, name: string) => text(form, name).replace(/\s+/g, "") || undefined;

/** Numeric field, or undefined when empty (the API validates the value). */
export function num(form: FormData, name: string): number | undefined {
  const raw = text(form, name);
  return raw === "" ? undefined : Number(raw);
}

/** A rupee amount typed in a form ("49" or "49.50") as integer paise, or undefined when empty. */
export function paise(form: FormData, name: string): number | undefined {
  const raw = text(form, name);
  if (raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

/** Submitted string fields except secrets, to repopulate a form after an error. */
export function valuesOf(form: FormData, exclude: string[] = ["password"]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !exclude.includes(key) && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  rangeKm: "Range",
  topSpeedKmh: "Top speed",
  batteryCapacityWh: "Battery capacity",
  batteryPercent: "Battery",
  odometerKm: "Odometer",
  registrationNumber: "Registration number",
  opensAt: "Opening time",
  closesAt: "Closing time",
  modelId: "Model",
  hourlyRateAmount: "Rate per hour",
  dailyRateAmount: "Day rate",
  includedKmPerHour: "Included km per hour",
  extraKmRateAmount: "Extra km rate",
  lateFeePerHourAmount: "Late fee per hour",
  graceMinutes: "Grace period",
  depositAmount: "Deposit",
  stationId: "Station",
  cityId: "City",
};

/** "rangeKm" -> "Range"; unknown camelCase ids become "Some field name". */
export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const words = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Rewrites class-validator wording ("must be longer than or equal to 1 characters") in plain language. */
export function friendlyMessage(line: string): string {
  const text = line
    .replace(/ must be longer than or equal to 1 characters?$/, " is required")
    .replace(/ must be longer than or equal to (\d+) characters?$/, " must be at least $1 characters")
    .replace(/ must be shorter than or equal to (\d+) characters?$/, " must be at most $1 characters")
    .replace(/ must be a number conforming to the specified constraints$/, " must be a number")
    .replace(/ must be an integer number$/, " must be a whole number")
    .replace(/ must be a latitude string or number$/, " must be a number between -90 and 90")
    .replace(/ must be a longitude string or number$/, " must be a number between -180 and 180")
    .replace(/ must not be less than (\S+)$/, " must be at least $1")
    .replace(/ must not be greater than (\S+)$/, " must be at most $1")
    .replace(/ (should not be empty|must be a string|must be a UUID)$/, " is required");
  const [field, ...rest] = text.split(" ");
  return `${fieldLabel(field)} ${rest.join(" ")}`.trim();
}

/** Turns an API failure into form state. Validation messages ("email must be an email") map to fields. */
export function failure(res: Extract<ApiResult<unknown>, { ok: false }>): FormState {
  if (res.code === "VALIDATION_ERROR" && res.details?.length) {
    const fieldErrors: Record<string, string> = {};
    for (const line of res.details) {
      const field = line.split(" ")[0];
      if (field && !fieldErrors[field]) fieldErrors[field] = friendlyMessage(line);
    }
    return { fieldErrors, error: "Check the highlighted fields." };
  }
  if (res.code === "EMAIL_TAKEN") return { fieldErrors: { email: res.message } };
  if (res.code === "PHONE_TAKEN") return { fieldErrors: { phone: res.message } };
  if (res.code === "OTP_INVALID") return { fieldErrors: { code: res.message } };
  if (res.code === "VEHICLE_CODE_TAKEN") return { fieldErrors: { code: res.message } };
  if (res.code === "REGISTRATION_TAKEN") return { fieldErrors: { registrationNumber: res.message } };
  return { error: res.message };
}
