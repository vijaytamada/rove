import Link from "next/link";
import type { ReactNode } from "react";
import { StatusChip } from "@/components/app/StatusChip";
import { messageForCode } from "@/lib/error-messages";
import type { VehicleStatus } from "@/lib/types";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {title && <h2 className="mb-4 text-base font-semibold tracking-tight">{title}</h2>}
      {children}
    </section>
  );
}

/** Shows the error passed back by a row action via ?error=. */
export function ErrorBanner({ message: code }: { message?: string }) {
  const message = messageForCode(code);
  if (!message) return null;
  return (
    <p role="alert" className="mb-6 rounded-control bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="rtable w-full text-left text-sm md:min-w-[40rem] [&_tbody_tr:last-child_td]:border-b-0">{children}</table>
    </div>
  );
}

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={`border-b border-line bg-canvas/50 px-5 py-3 text-xs font-medium uppercase tracking-wide text-ink-muted ${className}`}>
    {children}
  </th>
);

/** `label` is shown beside the value when the table reflows into cards on phones. */
export const Td = ({ children, className = "", label }: { children?: ReactNode; className?: string; label?: string }) => (
  <td data-label={label} className={`border-b border-line px-5 py-4 align-middle ${className}`}>
    <div className="cell">{children}</div>
  </td>
);

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-ink-muted">
        {children}
      </td>
    </tr>
  );
}

/** Small button that runs a bound server action (no client JS needed). */
export function RowButton({
  action,
  children,
  tone = "default",
}: {
  action: () => Promise<void>;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          tone === "danger"
            ? "border-red-200 text-red-700 hover:bg-red-50"
            : "border-line text-ink hover:bg-canvas"
        }`}
      >
        {children}
      </button>
    </form>
  );
}

export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-canvas">
      {children}
    </Link>
  );
}

const VEHICLE_TONE: Record<VehicleStatus, "success" | "warning" | "danger" | "muted"> = {
  AVAILABLE: "success",
  RESERVED: "warning",
  IN_RIDE: "warning",
  MAINTENANCE: "warning",
  OFFLINE: "muted",
};
const VEHICLE_LABEL: Record<VehicleStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  IN_RIDE: "In ride",
  MAINTENANCE: "Maintenance",
  OFFLINE: "Offline",
};

export const VehicleStatusChip = ({ status }: { status: VehicleStatus }) => (
  <StatusChip tone={VEHICLE_TONE[status]}>{VEHICLE_LABEL[status]}</StatusChip>
);
export const VEHICLE_STATUS_LABEL = VEHICLE_LABEL;
