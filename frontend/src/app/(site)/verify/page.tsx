import { ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/app/ButtonLink";
import { safeNext } from "@/lib/access";
import { requireRole } from "@/lib/dal";
import { apiGet } from "@/lib/server-api";
import type { KycView } from "@/lib/types";
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
        <div aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent-ink">
          <ShieldCheck size={24} strokeWidth={1.75} />
        </div>
        {kyc.status === "VERIFIED" ? (
          <>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">You&apos;re verified</h1>
            <p className="mt-2 text-ink-muted">Your identity is confirmed. You can book scooters.</p>
            <div className="mt-6">
              <ButtonLink href={next}>Continue</ButtonLink>
            </div>
          </>
        ) : (
          <>
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
