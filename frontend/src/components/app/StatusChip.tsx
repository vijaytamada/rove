type Tone = "success" | "warning" | "danger" | "muted";

const tones: Record<Tone, string> = {
  success: "bg-accent-soft text-accent-ink",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  muted: "bg-line text-ink-muted",
};

/** Always pairs color with text so status is never color-only. */
export function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
