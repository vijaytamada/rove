"use client";

import type { InputHTMLAttributes } from "react";
import { useFormResult } from "./ActionForm";

const inputClass = (error?: string) =>
  `h-12 w-full rounded-control border bg-surface px-4 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-ink ${
    error ? "border-danger" : "border-line"
  }`;

function Wrapper({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "name"> {
  label: string;
  name: string;
  hint?: string;
}

/** Text/number input inside an <ActionForm>: shows field errors and keeps values after a failed submit. */
export function Field({ label, name, hint, defaultValue, ...input }: FieldProps) {
  const result = useFormResult();
  const error = result.fieldErrors?.[name];
  return (
    <Wrapper label={label} name={name} error={error} hint={hint}>
      <input
        id={name}
        name={name}
        defaultValue={result.values?.[name] ?? (defaultValue as string | undefined)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={inputClass(error)}
        {...input}
      />
    </Wrapper>
  );
}

interface SelectProps {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

export function SelectField({ label, name, options, defaultValue, placeholder, hint, required }: SelectProps) {
  const result = useFormResult();
  const error = result.fieldErrors?.[name];
  return (
    <Wrapper label={label} name={name} error={error} hint={hint}>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={result.values?.[name] ?? defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        className={`${inputClass(error)} appearance-none`}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

interface CheckboxGroupProps {
  label: string;
  name: string;
  options: { value: string; label: string; hint?: string }[];
  defaultValues?: string[];
  hint?: string;
}

/** Several checkboxes submitted under one name (read with form.getAll). */
export function CheckboxGroup({ label, name, options, defaultValues = [], hint }: CheckboxGroupProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium">{label}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing to choose from yet.</p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-control border border-line bg-surface p-2">
          {options.map((o) => (
            <label key={o.value} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-canvas">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={defaultValues.includes(o.value)}
                className="size-4 accent-ink"
              />
              <span className="text-sm">
                {o.label}
                {o.hint && <span className="ml-2 text-ink-muted">{o.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
      {hint && <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>}
    </fieldset>
  );
}
