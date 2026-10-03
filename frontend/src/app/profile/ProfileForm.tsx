"use client";

import { useActionState } from "react";
import { updateProfile, type FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { TextField } from "@/components/app/TextField";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfile, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        defaultValue={state.values?.fullName ?? fullName}
        error={state.fieldErrors?.fullName}
        required
      />
      <TextField
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="+919876543210"
        hint="Changing your phone number means verifying it again."
        defaultValue={state.values?.phone ?? phone ?? ""}
        error={state.fieldErrors?.phone}
      />
      <SubmitButton variant="secondary">Save changes</SubmitButton>
    </form>
  );
}
