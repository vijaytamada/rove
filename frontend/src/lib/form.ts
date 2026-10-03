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

/** Submitted string fields except secrets, to repopulate a form after an error. */
export function valuesOf(form: FormData, exclude: string[] = ["password"]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !exclude.includes(key) && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}

/** Turns an API failure into form state. Validation messages ("email must be an email") map to fields. */
export function failure(res: Extract<ApiResult<unknown>, { ok: false }>): FormState {
  if (res.code === "VALIDATION_ERROR" && res.details?.length) {
    const fieldErrors: Record<string, string> = {};
    for (const line of res.details) {
      const field = line.split(" ")[0];
      if (field && !fieldErrors[field]) fieldErrors[field] = line.charAt(0).toUpperCase() + line.slice(1);
    }
    return { fieldErrors, error: "Check the highlighted fields." };
  }
  if (res.code === "EMAIL_TAKEN") return { fieldErrors: { email: res.message } };
  if (res.code === "PHONE_TAKEN") return { fieldErrors: { phone: res.message } };
  if (res.code === "OTP_INVALID") return { fieldErrors: { code: res.message } };
  if (res.code === "VEHICLE_CODE_TAKEN") return { fieldErrors: { code: res.message } };
  return { error: res.message };
}
