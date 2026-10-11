import { Hourglass, ShieldCheck, ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/app/ButtonLink";
import { safeNext } from "@/lib/access";
import { requireRole } from "@/lib/dal";
import { apiGet } from "@/lib/server-api";
import type { KycView } from "@/lib/types";
import { PendingRefresh } from "./PendingRefresh";
import { VerifyForm } from "./VerifyForm";

export const metadata = { title: "Verify your identity" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requireRole("/verify", "CUSTOMER");
  const { next: nextParam } = await searchParams;
  const next = safeNext(nextParam) ?? "/bookings";
  const kyc = await apiGet<KycView>("/kyc/status");

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
        {kyc.status === "VERIFIED" ? (
          <>
            <Badge>
              <ShieldCheck size={24} strokeWidth={1.75} />
            </Badge>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">You&apos;re verified</h1>
            <p className="mt-2 text-ink-muted">Your identity is confirmed. You can book scooters.</p>
            <div className="mt-6">
              <ButtonLink href={next}>Continue</ButtonLink>
            </div>
          </>
        ) : kyc.status === "PENDING" ? (
          <>
            <Badge>
              <Hourglass size={24} strokeWidth={1.75} />
            </Badge>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">We&apos;re checking your details</h1>
            <p className="mt-2 text-ink-muted">
              This usually takes a minute. You can leave this page: we&apos;ll send you a notification when it&apos;s done.
            </p>
            <PendingRefresh />
            <div className="mt-6">
              <ButtonLink href={`/verify?next=${encodeURIComponent(next)}`} variant="secondary">
                Check again
              </ButtonLink>
            </div>
          </>
        ) : kyc.status === "REJECTED" ? (
          <>
            <Badge tone="danger">
              <ShieldX size={24} strokeWidth={1.75} />
            </Badge>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">We couldn&apos;t verify your identity</h1>
            {kyc.rejectionReason && (
              <p role="alert" className="mt-3 rounded-control bg-red-50 px-4 py-3 text-sm text-red-700">
                {kyc.rejectionReason}
              </p>
            )}
            {kyc.attemptsLeft > 0 ? (
              <>
                <p className="mt-3 text-ink-muted">
                  You can try again. {kyc.attemptsLeft} {kyc.attemptsLeft === 1 ? "try" : "tries"} left.
                </p>
                <VerifyForm next={next} retry />
              </>
            ) : (
              <p className="mt-3 text-ink-muted">
                You&apos;ve used all your tries. Please contact support and we&apos;ll help you get verified.
              </p>
            )}
          </>
        ) : (
          <>
            <Badge>
              <ShieldCheck size={24} strokeWidth={1.75} />
            </Badge>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Verify your identity</h1>
            <p className="mt-2 text-ink-muted">
              We confirm who you are once, before your first ride. This takes a moment.
            </p>
            <p className="mt-3 rounded-control bg-canvas px-4 py-3 text-sm text-ink-muted">
              This is a demo check: it is approved straight away and no documents are collected.
            </p>
            <VerifyForm next={next} />
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "danger" }) {
  return (
    <div
      aria-hidden="true"
      className={`grid size-12 place-items-center rounded-full ${
        tone === "danger" ? "bg-red-50 text-red-700" : "bg-accent-soft text-accent-ink"
      }`}
    >
      {children}
    </div>
  );
}
