import { createCity, setCityActive } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { AddDialog } from "@/components/admin/AddDialog";
import { Field, FormGrid } from "@/components/admin/Fields";
import { EmptyRow, ErrorBanner, PageHeader, RowButton, TableWrap, Td, Th } from "@/components/admin/ui";
import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";
import { apiGetAll } from "@/lib/server-api";
import type { CityView } from "@/lib/types";

export const metadata = { title: "Cities" };
export const dynamic = "force-dynamic";

export default async function CitiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("/admin/cities", "CITY_MANAGER", "SUPER_ADMIN");
  const { error } = await searchParams;
  const cities = await apiGetAll<CityView>("/manage/cities");
  const canEdit = user.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader
        title="Cities"
        description={canEdit ? "Cities where Rove operates." : "The cities you manage."}
        action={
          canEdit && (
            <AddDialog label="Add city" title="Add a city">
              <ActionForm action={createCity} submitLabel="Add city" resetOnSuccess>
                <FormGrid>
                  <Field label="Name" name="name" placeholder="Pune" required />
                  <Field label="State" name="state" placeholder="Maharashtra" required />
                  <Field wide label="Time zone" name="timezone" defaultValue="Asia/Kolkata" hint="IANA name, e.g. Asia/Kolkata." />
                </FormGrid>
              </ActionForm>
            </AddDialog>
          )
        }
      />
      <ErrorBanner message={error} />

      <TableWrap>
        <thead>
          <tr>
            <Th>City</Th>
            <Th>State</Th>
            <Th>Time zone</Th>
            <Th>Status</Th>
            {canEdit && <Th />}
          </tr>
        </thead>
        <tbody>
          {cities.length === 0 && <EmptyRow colSpan={canEdit ? 5 : 4}>No cities yet.</EmptyRow>}
          {cities.map((c) => (
            <tr key={c.id}>
              <Td label="City" className="font-medium">{c.name}</Td>
              <Td label="State">{c.state}</Td>
              <Td label="Time zone" className="text-ink-muted">{c.timezone}</Td>
              <Td label="Status">
                <StatusChip tone={c.isActive ? "success" : "muted"}>{c.isActive ? "Active" : "Hidden"}</StatusChip>
              </Td>
              {canEdit && (
                <Td className="text-right">
                  <RowButton action={setCityActive.bind(null, c.id, !c.isActive)}>
                    {c.isActive ? "Hide" : "Show"}
                  </RowButton>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="mt-3 text-sm text-ink-muted">Hidden cities and their stations don&apos;t appear to customers.</p>
    </>
  );
}
