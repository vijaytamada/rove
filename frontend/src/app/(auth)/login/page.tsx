import Link from "next/link";
import { safeNext } from "@/lib/access";
import { PhoneLoginForm } from "./PhoneLoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? "";
  return (
    <>
      <PhoneLoginForm next={next} devHint={process.env.NODE_ENV !== "production"} />
      <p className="mt-8 text-center text-sm text-ink-muted">
        Work at a station?{" "}
        <Link
          href={next ? `/login/staff?next=${encodeURIComponent(next)}` : "/login/staff"}
          className="font-medium text-ink underline underline-offset-4"
        >
          Staff sign in
        </Link>
      </p>
    </>
  );
}
