"use client";

import { useActionState } from "react";
import { startKyc } from "@/app/actions/booking";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import type { FormState } from "@/lib/form";

export function VerifyForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(startKyc, {});
  const error = state.fieldErrors?.consent;
  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="consent"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "consent-error" : undefined}
            className="mt-1 size-5 accent-ink"
          />
          <span className="text-sm">I agree to my details being used to verify who I am before renting a scooter.</span>
        </label>
        {error && (
          <p id="consent-error" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <SubmitButton>Verify me</SubmitButton>
    </form>
  );
}
