"use client";

import { Plus } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Modal } from "@/components/app/Modal";

const DialogCloseContext = createContext<(() => void) | null>(null);

/** Lets a form inside an <AddDialog> close it after a successful save. */
export const useDialogClose = () => useContext(DialogCloseContext);

/** A header button that opens a modal with a form inside. */
export function AddDialog({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink/90"
      >
        <Plus size={18} aria-hidden="true" />
        {label}
      </button>
      <Modal open={open} onClose={close} title={title}>
        <DialogCloseContext.Provider value={close}>{children}</DialogCloseContext.Provider>
      </Modal>
    </>
  );
}
