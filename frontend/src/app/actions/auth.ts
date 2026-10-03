"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiRequest } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/access";
import { clearSessionCookies, getAccessToken, getRefreshToken, setSessionCookies } from "@/lib/session";
import { failure, text, type FormState } from "@/lib/form";
import type { AuthResult, UserView } from "@/lib/types";

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
