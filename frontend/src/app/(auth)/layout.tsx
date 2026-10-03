import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/app/Wordmark";

/** Sign-in/register: brand panel beside the form on desktop, form only on phones. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <Link href="/" aria-label="Home">
          <Wordmark className="text-xl" />
        </Link>
        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Pick up a scooter. Ride. Return it at any station.
          </h2>
          <p className="mt-4 text-base text-white/70">
            Book in minutes, pay securely, and get your deposit back when you return.
          </p>
        </div>
        <p className="text-sm text-white/50">Electric scooters for every city.</p>
      </aside>

      <div className="flex min-h-dvh flex-col px-5 py-8 sm:px-10 lg:min-h-0 lg:justify-center lg:px-16">
        <Link href="/" aria-label="Home" className="lg:hidden">
          <Wordmark className="text-lg" />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 lg:flex-none lg:py-0">
          {children}
        </div>
      </div>
    </div>
  );
}
