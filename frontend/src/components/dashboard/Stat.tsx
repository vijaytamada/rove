import Link from "next/link";

type Tone = "plain" | "good" | "warn" | "bad";
const TONE: Record<Tone, string> = { plain: "", good: "text-accent-ink", warn: "text-amber-700", bad: "text-danger" };

/** One number with a label. A link when it leads somewhere (the list behind the number). */
export function Stat({
  label,
  value,
  hint,
  href,
  tone = "plain",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: Tone;
}) {
  const body = (
    <>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tracking-tight sm:mt-2 sm:text-3xl ${TONE[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-card border border-line bg-surface p-4 transition-colors hover:border-ink/30 sm:p-5">
      {body}
    </Link>
  ) : (
    <div className="rounded-card border border-line bg-surface p-4 sm:p-5">{body}</div>
  );
}
