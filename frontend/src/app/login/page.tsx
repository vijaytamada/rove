import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { Wordmark } from "@/components/app/Wordmark";
import { safeNext } from "@/lib/access";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? "";
  return (
    <AppShell>
      <main className="flex flex-1 flex-col px-5 pb-10 pt-12">
        <Wordmark className="text-2xl" />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-muted">Sign in to book and manage your rides.</p>
        <div className="mt-8">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-sm text-ink-muted">
          New here?{" "}
          <Link
            href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
            className="font-medium text-ink underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </main>
    </AppShell>
  );
}
