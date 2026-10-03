import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { setStaffAssignments, updateStaff } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxGroup, Field } from "@/components/admin/Fields";
import { ErrorBanner, PageHeader, Panel } from "@/components/admin/ui";
import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";
import { apiGet, apiGetAll } from "@/lib/server-api";
import type { CityView, StationView, UserView } from "@/lib/types";

export const metadata = { title: "Manage staff" };
export const dynamic = "force-dynamic";

export default async function ManageStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireRole("/admin/staff", "CITY_MANAGER", "SUPER_ADMIN");
  const { id } = await params;
  const { error } = await searchParams;
  const person = await apiGet<UserView>(`/users/${id}`).catch(() => null);
  if (!person) notFound();

  const [cities, stations] = await Promise.all([
    apiGetAll<CityView>("/manage/cities"),
    apiGetAll<StationView>("/manage/stations"),
  ]);
  const cityName = new Map(cities.map((c) => [c.id, c.name]));

  return (
    <>
      <Link href="/admin/staff" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Staff
      </Link>
      <PageHeader
        title={person.fullName}
        description={person.email}
        action={
          <StatusChip tone={person.status === "ACTIVE" ? "success" : "danger"}>
            {person.status === "ACTIVE" ? "Active" : "Disabled"}
          </StatusChip>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Panel title="Details">
          <ActionForm action={updateStaff.bind(null, person.id)} submitLabel="Save">
            <Field label="Full name" name="fullName" defaultValue={person.fullName} required />
          </ActionForm>
        </Panel>

        {person.role === "STATION_EMPLOYEE" && (
          <Panel title="Stations">
            <ActionForm action={setStaffAssignments.bind(null, person.id, person.role)} submitLabel="Save stations">
              <CheckboxGroup
                label="Works at"
                name="stationIds"
                defaultValues={person.scope?.stationIds ?? []}
                options={stations.map((s) => ({ value: s.id, label: s.name, hint: cityName.get(s.cityId) }))}
                hint="At least one station."
              />
            </ActionForm>
          </Panel>
        )}

        {person.role === "CITY_MANAGER" && actor.role === "SUPER_ADMIN" && (
          <Panel title="Cities">
            <ActionForm action={setStaffAssignments.bind(null, person.id, person.role)} submitLabel="Save cities">
              <CheckboxGroup
                label="Manages"
                name="cityIds"
                defaultValues={person.scope?.cityIds ?? []}
                options={cities.map((c) => ({ value: c.id, label: c.name }))}
              />
            </ActionForm>
          </Panel>
        )}

        {person.role === "SUPER_ADMIN" && (
          <Panel title="Access">
            <p className="text-sm text-ink-muted">Super admins can manage every city and station.</p>
          </Panel>
        )}
      </div>
    </>
  );
}
