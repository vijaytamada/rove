import Link from "next/link";
import { Wordmark } from "@/components/app/Wordmark";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <Wordmark className="text-2xl" />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">We can&apos;t find that page</h1>
      <p className="mt-2 text-ink-muted">The link may be old, or the page may have moved.</p>
      <Link
        href="/"
        className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-ink text-base font-medium text-white transition-colors hover:bg-ink/90"
      >
        Go home
      </Link>
    </main>
  );
}
