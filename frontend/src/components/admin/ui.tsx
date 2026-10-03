import Link from "next/link";
import type { ReactNode } from "react";
import { StatusChip } from "@/components/app/StatusChip";
import { messageForCode } from "@/lib/error-messages";
import type { VehicleStatus } from "@/lib/types";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-2 text-ink-muted">{description}</p>}
      </div>
      {action}
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
      <table className="w-full min-w-[36rem] text-left text-sm">{children}</table>
    </div>
  );
}

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={`border-b border-line px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-muted ${className}`}>
    {children}
  </th>
);

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`border-b border-line px-4 py-3 align-middle last:border-b-0 ${className}`}>{children}</td>
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
