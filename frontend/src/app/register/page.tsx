import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { Wordmark } from "@/components/app/Wordmark";
import { safeNext } from "@/lib/access";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? "";
  return (
    <AppShell>
      <main className="flex flex-1 flex-col px-5 pb-10 pt-12">
        <Wordmark className="text-2xl" />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">It takes a minute. Then pick a scooter and go.</p>
        <div className="mt-8">
          <RegisterForm next={next} />
        </div>
        <p className="mt-6 text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="font-medium text-ink underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </main>
    </AppShell>
  );
}
