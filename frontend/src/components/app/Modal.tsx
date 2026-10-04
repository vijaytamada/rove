"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small text under the title. */
  description?: string;
  children: ReactNode;
  /** Tailwind max-width class; forms use `max-w-2xl`, short flows `max-w-md`. */
  size?: string;
}

/** Controlled modal on a native <dialog>: focus trap, Esc and backdrop click come free. */
export function Modal({ open, onClose, title, description, children, size = "max-w-2xl" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the close button; land on the first field instead.
      dialog.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size} rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto p-6">{open && children}</div>
    </dialog>
  );
}
