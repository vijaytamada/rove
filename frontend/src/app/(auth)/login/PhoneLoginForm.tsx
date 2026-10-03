"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { phoneLogin, type PhoneLoginState } from "@/app/actions/auth";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { TextField } from "@/components/app/TextField";
import { formatPhone } from "@/lib/phone";

const TITLES = { phone: "Let's get you riding", code: "Enter the code", name: "What's your name?" } as const;

/** Customer sign-in: phone number -> 6-digit code -> name (only for a number we haven't seen before). */
export function PhoneLoginForm({ next, devHint }: { next: string; devHint: boolean }) {
  const [state, action, pending] = useActionState<PhoneLoginState, FormData>(phoneLogin, {});
  const formRef = useRef<HTMLFormElement>(null);
  const step = state.step ?? "phone";

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{TITLES[step]}</h1>
      {step === "code" && (
        <p className="mt-2 text-ink-muted">We sent a 6-digit code to {formatPhone(state.phone ?? "")}.</p>
      )}

      <form ref={formRef} action={action} className="mt-8 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />

        {step === "phone" && <PhoneStep state={state} />}
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

/** Keeps only digits, drops a pasted +91 / 0 prefix and caps at 10 digits. */
function tenDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function PhoneStep({ state }: { state: PhoneLoginState }) {
  const error = state.fieldErrors?.phone;
  return (
    <>
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
          Mobile number
        </label>
        <div
          className={`flex h-12 items-center rounded-control border bg-surface transition-colors focus-within:border-ink ${
            error ? "border-danger" : "border-line"
          }`}
        >
          <span className="select-none pl-4 pr-2 text-base text-ink-muted">+91</span>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            defaultValue={state.values?.phone}
            onInput={(e) => {
              e.currentTarget.value = tenDigits(e.currentTarget.value);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "phone-error" : undefined}
            className="h-full min-w-0 flex-1 bg-transparent pr-4 text-base outline-none placeholder:text-ink-faint"
            autoFocus
            required
          />
        </div>
        {error && (
          <p id="phone-error" className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <SubmitButton>Continue</SubmitButton>
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
