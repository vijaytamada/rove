import Link from "next/link";
import { safeNext } from "@/lib/access";
import { StaffLoginForm } from "./StaffLoginForm";

export const metadata = { title: "Staff sign in" };

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? "";
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Staff sign in</h1>
      <p className="mt-2 text-ink-muted">For station employees, city managers and admins.</p>
      <div className="mt-8">
        <StaffLoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Renting a scooter?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-ink underline underline-offset-4"
        >
          Sign in with your phone
        </Link>
      </p>
    </>
  );
}
