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
  wide,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
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
  /** Span both columns inside a <FormGrid>. */
  wide?: boolean;
}

/** Text/number input inside an <ActionForm>: shows field errors and keeps values after a failed submit. */
export function Field({ label, name, hint, wide, defaultValue, ...input }: FieldProps) {
  const result = useFormResult();
  const error = result.fieldErrors?.[name];
  return (
    <Wrapper label={label} name={name} error={error} hint={hint} wide={wide}>
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
  wide?: boolean;
  /** Controlled mode, for forms that react to the choice. */
  value?: string;
  onChange?: (value: string) => void;
}

export function SelectField({ label, name, options, defaultValue, placeholder, hint, required, wide, value, onChange }: SelectProps) {
  const result = useFormResult();
  const error = result.fieldErrors?.[name];
  return (
    <Wrapper label={label} name={name} error={error} hint={hint} wide={wide}>
      <select
        id={name}
        name={name}
        required={required}
        {...(onChange
          ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) }
          : { defaultValue: result.values?.[name] ?? defaultValue ?? "" })}
        aria-invalid={error ? true : undefined}
        className={`${inputClass(error)} select-chevron pr-10`}
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
  wide?: boolean;
}

/** Several checkboxes submitted under one name (read with form.getAll). */
export function CheckboxGroup({ label, name, options, defaultValues = [], hint, wide }: CheckboxGroupProps) {
  return (
    <fieldset className={wide ? "sm:col-span-2" : undefined}>
      <legend className="mb-1.5 block text-sm font-medium">{label}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing to choose from yet.</p>
      ) : (
        <div className="grid max-h-60 gap-1 overflow-y-auto rounded-control border border-line bg-surface p-2 sm:grid-cols-2">
          {options.map((o) => (
            <label key={o.value} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-canvas">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={defaultValues.includes(o.value)}
                className="size-4 accent-ink"
              />
              <span className="min-w-0 text-sm">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block truncate text-xs text-ink-muted">{o.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
      {hint && <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>}
    </fieldset>
  );
}

/** Two-column form layout (one column on phones). Use `wide` on a field to span both. */
export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{children}</div>;
}
