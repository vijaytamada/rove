"use client";

import { useActionState, useState, useTransition } from "react";
import { sendPhoneCode, verifyPhoneCode, type FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { TextField } from "@/components/app/TextField";

export function PhoneVerification({ phone, devHint }: { phone: string; devHint: boolean }) {
  const [sendState, setSendState] = useState<FormState>({});
  const [sending, startSending] = useTransition();
  const [verifyState, verifyAction] = useActionState<FormState, FormData>(verifyPhoneCode, {});

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="text-sm font-medium">Verify your phone</h2>
      <p className="mt-1 text-sm text-ink-muted">We&apos;ll text a 6-digit code to {phone}.</p>
      {devHint && <p className="mt-1 text-sm text-ink-muted">Development mode: the code is always 123456.</p>}

      <div className="mt-4 space-y-4">
        <FormMessage state={sendState} />
        <button
          type="button"
          disabled={sending}
          onClick={() => startSending(async () => setSendState(await sendPhoneCode()))}
          className="h-12 w-full rounded-full border border-line bg-surface text-base font-medium transition-colors hover:bg-canvas disabled:opacity-60"
        >
          {sending ? "Sending…" : sendState.ok ? "Resend code" : "Send code"}
        </button>

        <form action={verifyAction} className="space-y-4" noValidate>
          <FormMessage state={verifyState} />
          <TextField
            label="Code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            error={verifyState.fieldErrors?.code}
          />
          <SubmitButton>Verify</SubmitButton>
        </form>
      </div>
    </section>
  );
}
