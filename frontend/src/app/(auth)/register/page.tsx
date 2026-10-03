import { redirect } from "next/navigation";
import { safeNext } from "@/lib/access";

/** Customers no longer register with a form: signing in with a new phone number creates the account. */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
