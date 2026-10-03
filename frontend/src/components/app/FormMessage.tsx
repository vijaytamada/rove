import type { FormState } from "@/app/actions/auth";

/** Form-level success/error message. Field errors are shown by each TextField. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-sm text-accent-ink">
        {state.message}
      </p>
    );
  }
  return null;
}
