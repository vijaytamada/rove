"use client";

import { useActionState } from "react";
import { register, type FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { TextField } from "@/components/app/TextField";

export function RegisterForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(register, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
        required
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="name@company.com"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <TextField
        label="Phone (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="+919876543210"
        hint="Include the country code. You'll verify it before your first booking."
        defaultValue={state.values?.phone}
        error={state.fieldErrors?.phone}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
        required
      />
      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
