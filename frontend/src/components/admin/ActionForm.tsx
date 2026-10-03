"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import type { FormState } from "@/lib/form";

const FormStateContext = createContext<FormState>({});

/** Field components read the latest submit result (field errors and kept values) from here. */
export const useFormResult = () => useContext(FormStateContext);

interface Props {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  /** Clear the fields after a successful submit (use for "create" forms). */
  resetOnSuccess?: boolean;
  className?: string;
}

/** A server-action form with a form-level message, per-field errors and a progress button. */
export function ActionForm({
  action,
  submitLabel,
  children,
  variant = "primary",
  resetOnSuccess = false,
  className = "space-y-4",
}: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormStateContext.Provider value={state}>
      <form ref={ref} action={formAction} className={className} noValidate>
        <FormMessage state={state} />
        {children}
        <SubmitButton variant={variant}>{submitLabel}</SubmitButton>
      </form>
    </FormStateContext.Provider>
  );
}
