import { logout } from "@/app/actions/auth";
import { AppBar } from "@/components/app/AppBar";
import { AppShell } from "@/components/app/AppShell";
import { BottomNav } from "@/components/app/BottomNav";
import { StatusChip } from "@/components/app/StatusChip";
import { SubmitButton } from "@/components/app/SubmitButton";
import { requireUser } from "@/lib/dal";
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
    <AppShell>
      <AppBar title="Profile" />
      <main className="flex-1 space-y-4 px-5 pb-28 pt-2">
        <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-4">
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-base font-medium text-white"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.fullName}</p>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {user.role !== "CUSTOMER" && <StatusChip tone="muted">{ROLE_LABEL[user.role]}</StatusChip>}
              {user.phone &&
                (user.phoneVerified ? (
                  <StatusChip tone="success">Phone verified</StatusChip>
                ) : (
                  <StatusChip tone="warning">Phone not verified</StatusChip>
                ))}
            </div>
          </div>
        </section>

        {user.phone && !user.phoneVerified && (
          <PhoneVerification phone={user.phone} devHint={process.env.NODE_ENV !== "production"} />
        )}

        <section className="rounded-card border border-line bg-surface p-4">
          <h2 className="mb-4 text-sm font-medium">Your details</h2>
          <ProfileForm fullName={user.fullName} phone={user.phone} />
        </section>

        <form action={logout}>
          <SubmitButton variant="secondary">Sign out</SubmitButton>
        </form>
      </main>
      <BottomNav active="profile" />
    </AppShell>
  );
}
