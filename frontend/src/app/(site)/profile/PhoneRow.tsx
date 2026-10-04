"use client";

import { useEffect, useState, useTransition } from "react";
import {
  confirmPhoneChange,
  sendPhoneCode,
  startPhoneChange,
  verifyPhoneCode,
  type PhoneStepResult,
} from "@/app/actions/auth";
import { FormMessage } from "@/components/app/FormMessage";
import { Modal } from "@/components/app/Modal";
import { OtpInput } from "@/components/app/OtpInput";
import { StatusChip } from "@/components/app/StatusChip";
import { SubmitButton } from "@/components/app/SubmitButton";
import { formatPhone } from "@/lib/phone";
import { DetailRow } from "./DetailRow";

type Step = "number" | "code";
type Mode = "change" | "verify";

/** Keeps only digits, drops a pasted +91 / 0 prefix and caps at 10 digits. */
function tenDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * The phone line of the profile. Changing the number takes two steps: enter the new number, then enter the
 * code we text to it. The number is saved only after the code is right. A saved number that was never
 * verified skips straight to the code step ("Verify now").
 */
export function PhoneRow({ phone, verified, devHint }: { phone: string | null; verified: boolean; devHint: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("number");
  const [mode, setMode] = useState<Mode>("change");
  const [digits, setDigits] = useState("");
  const [target, setTarget] = useState(""); // the number the code went to
  const [code, setCode] = useState("");
  const [focusSignal, setFocusSignal] = useState(0);
  const [info, setInfo] = useState<PhoneStepResult>({});
  const [resendLeft, setResendLeft] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Resend countdown.
  useEffect(() => {
    if (resendLeft <= 0) return;
    const timer = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendLeft]);

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setDigits("");
    setCode("");
    setInfo({});
    setDone(null);
    setStep("number");
    setResendLeft(0);
    setOpen(true);
  };

  const gotCode = (result: PhoneStepResult, sentTo: string) => {
    setInfo({});
    setTarget(sentTo);
    setCode("");
    setStep("code");
    setFocusSignal((n) => n + 1);
    setResendLeft(result.resendAfter ?? 30);
  };

  /** Send a code: to the typed number (change) or to the saved one (verify). */
  const sendCode = (forMode: Mode = mode) => {
    startTransition(async () => {
      if (forMode === "verify" && phone) {
        const result = await sendPhoneCode();
        if (result.ok) return gotCode(result, phone);
        setStep("code");
        setTarget(phone);
        return setInfo(result);
      }
      const result = await startPhoneChange(digits);
      if (result.ok) return gotCode(result, `+91${digits}`);
      setInfo(result);
    });
  };

  const confirm = (value: string) => {
    startTransition(async () => {
      const result = await (mode === "verify" ? verifyPhoneCode(value) : confirmPhoneChange(value));
      if (result.ok) {
        setOpen(false);
        setDone(result.message ?? "Saved");
        return;
      }
      setInfo(result);
      setCode("");
      setFocusSignal((n) => n + 1);
    });
  };

  const title =
    step === "code" ? "Enter the code" : mode === "verify" ? "Verify your number" : phone ? "Change mobile number" : "Add a mobile number";

  return (
    <>
      <DetailRow
        label="Mobile number"
        onEdit={() => reset("change")}
        editLabel={phone ? "Change mobile number" : "Add mobile number"}
      >
        {phone ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-base font-medium">{formatPhone(phone)}</p>
            {verified ? (
              <StatusChip tone="success">Verified</StatusChip>
            ) : (
              <>
                <StatusChip tone="warning">Not verified</StatusChip>
                <button
                  type="button"
                  onClick={() => {
                    reset("verify");
                    setStep("code");
                    setTarget(phone);
                    sendCode("verify");
                  }}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  Verify now
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="text-base text-ink-muted">Not added</p>
        )}
        {done && <p className="mt-1 text-sm text-accent-ink">{done}</p>}

        <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="max-w-md"
        title={title}
        description={
          step === "number"
            ? "We'll text a 6-digit code to the new number before saving it."
            : `We sent a 6-digit code to ${formatPhone(target)}.`
        }
      >
        {step === "number" ? (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <FormMessage state={info} />
            <div>
              <label htmlFor="new-phone" className="mb-1.5 block text-sm font-medium">
                New mobile number
              </label>
              <div
                className={`flex h-12 items-center rounded-control border bg-surface transition-colors focus-within:border-ink ${
                  info.fieldErrors?.phone ? "border-danger" : "border-line"
                }`}
              >
                <span className="select-none pl-4 pr-2 text-base text-ink-muted">+91</span>
                <input
                  id="new-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  value={digits}
                  onChange={(e) => setDigits(tenDigits(e.target.value))}
                  aria-invalid={info.fieldErrors?.phone ? true : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent pr-4 text-base outline-none placeholder:text-ink-faint"
                  autoFocus
                />
              </div>
              {info.fieldErrors?.phone && <p className="mt-1.5 text-sm text-danger">{info.fieldErrors.phone}</p>}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="h-12 w-full rounded-full bg-ink text-base font-medium text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {pending ? "Please wait…" : "Send code"}
            </button>
          </form>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6) confirm(code);
            }}
          >
            <FormMessage state={info.fieldErrors?.code ? { ...info, error: undefined } : info} />
            <OtpInput
              name="code"
              value={code}
              onChange={(v) => {
                setCode(v);
                setInfo({});
                if (v.length === 6 && !pending) confirm(v);
              }}
              error={info.fieldErrors?.code}
              focusSignal={focusSignal}
            />
            {devHint && <p className="text-sm text-ink-muted">Development mode: the code is always 123456.</p>}
            <SubmitButton>{mode === "verify" ? "Verify" : "Verify and save"}</SubmitButton>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={resendLeft > 0 || pending}
                onClick={() => sendCode()}
                className="font-medium underline underline-offset-4 disabled:text-ink-muted disabled:no-underline"
              >
                {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
              </button>
              {mode === "change" && (
                <button
                  type="button"
                  onClick={() => {
                    setInfo({});
                    setStep("number");
                  }}
                  className="font-medium underline underline-offset-4"
                >
                  Change number
                </button>
              )}
            </div>
          </form>
        )}
        </Modal>
      </DetailRow>
    </>
  );
}
