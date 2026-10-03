import { logout } from "@/app/actions/auth";
import { StatusChip } from "@/components/app/StatusChip";
import { SubmitButton } from "@/components/app/SubmitButton";
import { requireUser } from "@/lib/dal";
import { formatPhone } from "@/lib/phone";
import type { Role } from "@/lib/types";
import { PhoneVerification } from "./PhoneVerification";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "Profile" };

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  CITY_MANAGER: "City manager",
  STATION_EMPLOYEE: "Station employee",
  CUSTOMER: "Customer",
};

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <section className="rounded-card border border-line bg-surface p-6">
            <div
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full bg-ink text-xl font-medium text-white"
            >
              {initials}
            </div>
            <p className="mt-4 text-lg font-semibold">{user.fullName}</p>
            <p className="break-all text-sm text-ink-muted">{user.email ?? (user.phone ? formatPhone(user.phone) : "")}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {user.role !== "CUSTOMER" && <StatusChip tone="muted">{ROLE_LABEL[user.role]}</StatusChip>}
              {user.phone &&
                (user.phoneVerified ? (
                  <StatusChip tone="success">Phone verified</StatusChip>
                ) : (
                  <StatusChip tone="warning">Phone not verified</StatusChip>
                ))}
            </div>
          </section>

          <form action={logout}>
            <SubmitButton variant="secondary">Sign out</SubmitButton>
          </form>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {user.phone && !user.phoneVerified && (
            <PhoneVerification phone={user.phone} devHint={process.env.NODE_ENV !== "production"} />
          )}

          <section className="rounded-card border border-line bg-surface p-6">
            <h2 className="mb-5 text-base font-semibold">Your details</h2>
            <div className="max-w-md">
              <ProfileForm fullName={user.fullName} phone={user.phone} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
