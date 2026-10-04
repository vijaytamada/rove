"use client";

import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Name of the hidden input that carries the joined code in the form. */
  name: string;
  length?: number;
  error?: string;
  /** Bump to pull focus back to the first empty box (e.g. after a wrong code). */
  focusSignal?: unknown;
}

/** One box per digit. Typing advances, Backspace goes back, pasting fills every box. */
export function OtpInput({ value, onChange, name, length = 6, error, focusSignal }: Props) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focusBox = (i: number) => boxes.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  useEffect(() => {
    focusBox(Math.min(value.length, length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  const setAt = (i: number, digit: string) => {
    const next = digits.slice();
    next[i] = digit;
    onChange(next.join("").slice(0, length));
  };

  return (
    <div>
      <label id={`${name}-label`} className="mb-1.5 block text-sm font-medium">
        Code
      </label>
      <input type="hidden" name={name} value={value} />
      <div role="group" aria-labelledby={`${name}-label`} className="flex gap-2 sm:gap-3">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            value={digit}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={error ? true : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const typed = e.target.value.replace(/\D/g, "");
              if (!typed) return setAt(i, "");
              if (typed.length > 1) {
                // autofill or fast typing delivered several digits at once
                const merged = (value.slice(0, i) + typed).slice(0, length);
                onChange(merged);
                return focusBox(merged.length);
              }
              setAt(i, typed);
              focusBox(i + 1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digit) {
                e.preventDefault();
                setAt(i - 1 >= 0 ? i - 1 : 0, "");
                focusBox(i - 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                focusBox(i - 1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                focusBox(i + 1);
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
              if (!pasted) return;
              e.preventDefault();
              onChange(pasted);
              focusBox(pasted.length);
            }}
            className={`h-14 min-w-0 flex-1 rounded-control border bg-surface text-center text-2xl font-semibold outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/10 ${
              error ? "border-danger" : "border-line"
            }`}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
