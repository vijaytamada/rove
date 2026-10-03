"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiRequest, type ApiResult } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/access";
import { clearSessionCookies, getAccessToken, getRefreshToken, setSessionCookies } from "@/lib/session";
import type { AuthResult, UserView } from "@/lib/types";

export interface FormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values (never passwords) so a failed submit does not clear the form. */
  values?: Record<string, string>;
}

const FIELDS = ["email", "password", "fullName", "phone", "code"];

/** Turns the API's class-validator messages ("email must be an email") into per-field errors. */
function failure(res: Extract<ApiResult<unknown>, { ok: false }>): FormState {
  if (res.code === "VALIDATION_ERROR" && res.details?.length) {
    const fieldErrors: Record<string, string> = {};
    for (const line of res.details) {
      const field = FIELDS.find((f) => line.startsWith(`${f} `));
      if (field && !fieldErrors[field]) fieldErrors[field] = line.charAt(0).toUpperCase() + line.slice(1);
    }
    return Object.keys(fieldErrors).length
      ? { fieldErrors, error: "Check the highlighted fields." }
      : { error: res.details[0] };
  }
  if (res.code === "EMAIL_TAKEN") return { fieldErrors: { email: res.message } };
  if (res.code === "PHONE_TAKEN") return { fieldErrors: { phone: res.message } };
  if (res.code === "OTP_INVALID") return { fieldErrors: { code: res.message } };
  return { error: res.message };
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => text(form, name).replace(/\s+/g, "") || undefined;

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const res = await apiRequest<AuthResult>("/auth/login", {
    body: { email: text(form, "email"), password: String(form.get("password") ?? "") },
  });
  if (!res.ok) {
    const state = res.code === "VALIDATION_ERROR" ? { error: "Enter your email and password." } : failure(res);
    return { ...state, values: { email: text(form, "email") } };
  }
  await setSessionCookies(res.data);
  redirect(safeNext(text(form, "next")) ?? homeFor(res.data.user.role));
}

export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  const res = await apiRequest<AuthResult>("/auth/register", {
    body: {
      email: text(form, "email"),
      password: String(form.get("password") ?? ""),
      fullName: text(form, "fullName"),
      phone: optional(form, "phone"),
    },
  });
  if (!res.ok) {
    return {
      ...failure(res),
      values: { fullName: text(form, "fullName"), email: text(form, "email"), phone: text(form, "phone") },
    };
  }
  await setSessionCookies(res.data);
  redirect(safeNext(text(form, "next")) ?? "/profile");
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) await apiRequest("/auth/logout", { body: { refreshToken } });
  await clearSessionCookies();
  redirect("/login");
}

export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const token = await getAccessToken();
  if (!token) redirect("/login?next=/profile");
  const body: Record<string, string> = { fullName: text(form, "fullName") };
  const phone = optional(form, "phone");
  if (phone) body.phone = phone;

  const res = await apiRequest<UserView>("/me", { method: "PATCH", body, token });
  if (!res.ok) return { ...failure(res), values: { fullName: text(form, "fullName"), phone: text(form, "phone") } };
  revalidatePath("/profile");
  return { ok: true, message: "Profile saved" };
}

export async function sendPhoneCode(): Promise<FormState> {
  const token = await getAccessToken();
  if (!token) redirect("/login?next=/profile");
  const res = await apiRequest("/auth/otp/send", { method: "POST", body: {}, token });
  return res.ok ? { ok: true, message: "Code sent" } : failure(res);
}

export async function verifyPhoneCode(_prev: FormState, form: FormData): Promise<FormState> {
  const token = await getAccessToken();
  if (!token) redirect("/login?next=/profile");
  const res = await apiRequest("/auth/otp/verify", { method: "POST", body: { code: text(form, "code") }, token });
  if (!res.ok) return failure(res);
  revalidatePath("/profile");
  return { ok: true, message: "Phone verified" };
}
