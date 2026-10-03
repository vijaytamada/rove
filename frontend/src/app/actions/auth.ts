"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiRequest } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/access";
import { clearSessionCookies, getAccessToken, getRefreshToken, setSessionCookies } from "@/lib/session";
import { failure, text, type FormState } from "@/lib/form";
import { normalizePhone } from "@/lib/phone";
import type { AuthResult, CodeSent, PhoneVerifyResult, UserView } from "@/lib/types";

export type { FormState } from "@/lib/form";

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

/** Customer sign-in is one form that moves through three steps; this is where it stands. */
export interface PhoneLoginState extends FormState {
  step?: "phone" | "code" | "name";
  /** The number a code was sent to (E.164). */
  phone?: string;
  /** Seconds before another code may be requested, counted from `sentAt`. */
  resendAfter?: number;
  /** Changes on every send so the countdown restarts. */
  sentAt?: number;
  /** Single-use ticket for finishing sign-up (new numbers only). */
  signupToken?: string;
}

/**
 * Customer sign-in: phone -> code -> name (new numbers only). Which step runs comes from the state the
 * form was rendered with; `intent` is set by the "Resend code" and "Change number" buttons.
 */
export async function phoneLogin(prev: PhoneLoginState, form: FormData): Promise<PhoneLoginState> {
  const step = prev.step ?? "phone";
  const intent = text(form, "intent");
  const next = safeNext(text(form, "next"));
  const keep: PhoneLoginState = {
    step,
    phone: prev.phone,
    resendAfter: prev.resendAfter,
    sentAt: prev.sentAt,
    signupToken: prev.signupToken,
  };

  if (intent === "change") return { step: "phone", values: { phone: prev.phone ?? "" } };

  // Step 1 (or "Resend code"): ask for a code.
  if (step === "phone" || intent === "resend") {
    const typed = text(form, "phone");
    const phone = step === "phone" ? normalizePhone(typed) : (prev.phone ?? "");
    const res = await apiRequest<CodeSent>("/auth/phone/request", { body: { phone } });
    if (!res.ok) {
      if (res.code === "VALIDATION_ERROR") {
        return { step: "phone", fieldErrors: { phone: "Enter a valid mobile number, e.g. 98765 43210." }, values: { phone: typed } };
      }
      return { ...keep, error: res.message, values: { phone: typed } };
    }
    return { step: "code", phone, resendAfter: res.data.resendAfterSeconds, sentAt: Date.now() };
  }

  // Step 2: check the code.
  if (step === "code") {
    const code = text(form, "code").replace(/\D/g, "");
    const res = await apiRequest<PhoneVerifyResult>("/auth/phone/verify", { body: { phone: prev.phone, code } });
    if (!res.ok) {
      if (res.code === "VALIDATION_ERROR") return { ...keep, fieldErrors: { code: "Enter the 6-digit code." } };
      return { ...keep, ...failure(res) };
    }
    if (res.data.status === "NEEDS_NAME") {
      return { step: "name", phone: prev.phone, signupToken: res.data.signupToken };
    }
    await setSessionCookies(res.data);
    redirect(next ?? homeFor(res.data.user.role));
  }

  // Step 3: a new number gives their name, which creates the account.
  const fullName = text(form, "fullName");
  const res = await apiRequest<AuthResult>("/auth/phone/signup", {
    body: { signupToken: prev.signupToken, fullName },
  });
  if (!res.ok) {
    if (res.code === "SIGNUP_EXPIRED") return { step: "phone", error: res.message, values: { phone: prev.phone ?? "" } };
    return { ...keep, ...failure(res), values: { fullName } };
  }
  await setSessionCookies(res.data);
  redirect(next ?? homeFor(res.data.user.role));
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
