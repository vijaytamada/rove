import type { ComponentProps } from "react";

interface Props extends ComponentProps<"input"> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, name, error, hint, id, ...input }: Props) {
  const fieldId = id ?? name;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`h-12 w-full rounded-control border bg-surface px-4 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-ink ${
          error ? "border-danger" : "border-line"
        }`}
        {...input}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
