import { logout } from "@/app/actions/auth";
import { StatusChip } from "@/components/app/StatusChip";
import { SubmitButton } from "@/components/app/SubmitButton";
import { requireUser } from "@/lib/dal";
import { formatPhone } from "@/lib/phone";
import type { Role } from "@/lib/types";
import { DetailRow } from "./DetailRow";
import { EditableName } from "./EditableName";
import { PhoneRow } from "./PhoneRow";

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
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
      <p className="mt-1.5 text-ink-muted">Your details and how we reach you.</p>

      <div className="mt-8 grid items-start gap-6 md:grid-cols-[18rem_1fr]">
        <div className="space-y-4">
          <section className="rounded-card border border-line bg-surface p-6 text-center md:text-left">
            <div
              aria-hidden="true"
              className="mx-auto flex size-20 items-center justify-center rounded-full bg-ink text-2xl font-medium text-white md:mx-0"
            >
              {initials}
            </div>
            <p className="mt-4 text-lg font-semibold">{user.fullName}</p>
            <p className="break-all text-sm text-ink-muted">{user.email ?? (user.phone ? formatPhone(user.phone) : "")}</p>
            {user.role !== "CUSTOMER" && (
              <div className="mt-3">
                <StatusChip tone="muted">{ROLE_LABEL[user.role]}</StatusChip>
              </div>
            )}
          </section>

          <form action={logout}>
            <SubmitButton variant="secondary">Sign out</SubmitButton>
          </form>
        </div>

        <section className="rounded-card border border-line bg-surface p-6 sm:p-8">
          <h2 className="mb-6 text-base font-semibold">Personal details</h2>
          <div>
            <EditableName fullName={user.fullName} />
            <PhoneRow phone={user.phone} verified={user.phoneVerified} devHint={process.env.NODE_ENV !== "production"} />
            {user.email && (
              <DetailRow label="Email">
                <p className="break-all text-base font-medium">{user.email}</p>
                <p className="mt-1 text-sm text-ink-muted">Used to sign in. Ask an admin to change it.</p>
              </DetailRow>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
