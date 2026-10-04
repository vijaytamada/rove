import { Pencil } from "lucide-react";
import type { ReactNode } from "react";

/** One line of the details card: small label, value, and an optional edit button on the right. */
export function DetailRow({
  label,
  children,
  onEdit,
  editLabel,
}: {
  label: string;
  children: ReactNode;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel ?? `Edit ${label.toLowerCase()}`}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
