"use client";

import { Plus, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

const DialogCloseContext = createContext<(() => void) | null>(null);

/** Lets a form inside an <AddDialog> close it after a successful save. */
export const useDialogClose = () => useContext(DialogCloseContext);

/** A header button that opens a modal with a form inside. Native <dialog>: focus trap, Esc and backdrop come free. */
export function AddDialog({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => ref.current?.close(), []);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink/90"
      >
        <Plus size={18} aria-hidden="true" />
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="add-dialog-title"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="add-dialog-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[75dvh] overflow-y-auto p-6">
          <DialogCloseContext.Provider value={close}>{children}</DialogCloseContext.Provider>
        </div>
      </dialog>
    </>
  );
}
