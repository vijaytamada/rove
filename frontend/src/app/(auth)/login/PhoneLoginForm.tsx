"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { phoneLogin, type PhoneLoginState } from "@/app/actions/auth";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { TextField } from "@/components/app/TextField";
import { formatPhone } from "@/lib/phone";

const HEADINGS = {
  phone: { title: "Sign in or sign up", body: "Enter your mobile number and we'll text you a code. No password needed." },
  code: { title: "Enter the code", body: "" },
  name: { title: "Almost there", body: "You're new here. What should we call you?" },
} as const;

/** Customer sign-in: phone number -> 6-digit code -> name (only for a number we haven't seen before). */
export function PhoneLoginForm({ next, devHint }: { next: string; devHint: boolean }) {
  const [state, action, pending] = useActionState<PhoneLoginState, FormData>(phoneLogin, {});
  const formRef = useRef<HTMLFormElement>(null);
  const step = state.step ?? "phone";
  const heading = HEADINGS[step];

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{heading.title}</h1>
      <p className="mt-2 text-ink-muted">
        {step === "code" ? `We sent a 6-digit code to ${formatPhone(state.phone ?? "")}.` : heading.body}
      </p>

      <form ref={formRef} action={action} className="mt-8 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />

        {step === "phone" && <PhoneStep state={state} devHint={devHint} />}
        {step === "code" && (
          <CodeStep
            state={state}
            pending={pending}
            devHint={devHint}
            onComplete={() => formRef.current?.requestSubmit()}
          />
        )}
        {step === "name" && <NameStep state={state} />}
      </form>
    </>
  );
}

function PhoneStep({ state, devHint }: { state: PhoneLoginState; devHint: boolean }) {
  return (
    <>
      <TextField
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="98765 43210"
        hint="Indian numbers don't need +91. For another country, start with + and the country code."
        defaultValue={state.values?.phone}
        error={state.fieldErrors?.phone}
        autoFocus
        required
      />
      {devHint && <p className="text-sm text-ink-muted">Development mode: the code is always 123456.</p>}
      <SubmitButton>Send code</SubmitButton>
    </>
  );
}

function CodeStep({
  state,
  pending,
  devHint,
  onComplete,
}: {
  state: PhoneLoginState;
  pending: boolean;
  devHint: boolean;
  onComplete: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  // After a wrong code the form resets; put the cursor back so they can retype straight away.
  useEffect(() => {
    if (state.fieldErrors?.code || state.error) input.current?.focus();
  }, [state]);

  return (
    <>
      <TextField
        ref={input}
        label="Code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="123456"
        error={state.fieldErrors?.code}
        onChange={(e) => {
          if (e.currentTarget.value.replace(/\D/g, "").length === 6 && !pending) onComplete();
        }}
        autoFocus
        required
      />
      {devHint && <p className="text-sm text-ink-muted">Development mode: the code is always 123456.</p>}
      <SubmitButton>Verify</SubmitButton>

      <div className="flex items-center justify-between text-sm">
        <ResendButton key={state.sentAt} seconds={state.resendAfter ?? 30} pending={pending} />
        <button
          type="submit"
          name="intent"
          value="change"
          formNoValidate
          className="font-medium text-ink underline underline-offset-4"
        >
          Change number
        </button>
      </div>
    </>
  );
}

function ResendButton({ seconds, pending }: { seconds: number; pending: boolean }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return (
    <button
      type="submit"
      name="intent"
      value="resend"
      disabled={left > 0 || pending}
      className="font-medium text-ink underline underline-offset-4 disabled:text-ink-muted disabled:no-underline"
    >
      {left > 0 ? `Resend code in ${left}s` : "Resend code"}
    </button>
  );
}

function NameStep({ state }: { state: PhoneLoginState }) {
  return (
    <>
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
        autoFocus
        required
      />
      <SubmitButton>Create account</SubmitButton>
    </>
  );
}
