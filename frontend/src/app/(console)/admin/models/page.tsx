import { createModel, setModelActive } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field } from "@/components/admin/Fields";
import { EmptyRow, ErrorBanner, PageHeader, Panel, RowButton, TableWrap, Td, Th } from "@/components/admin/ui";
import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";
import { apiGet } from "@/lib/server-api";
import type { VehicleModelView } from "@/lib/types";

export const metadata = { title: "Vehicle models" };
export const dynamic = "force-dynamic";

export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("/admin/models", "CITY_MANAGER", "SUPER_ADMIN");
  const { error } = await searchParams;
  const models = await apiGet<VehicleModelView[]>("/manage/vehicle-models");
  const canEdit = user.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader
        title="Vehicle models"
        description={canEdit ? "The catalogue every scooter belongs to." : "Models available for your fleet. Super admins manage this list."}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TableWrap>
            <thead>
              <tr>
                <Th>Model</Th>
                <Th>Range</Th>
                <Th>Top speed</Th>
                <Th>Battery</Th>
                <Th>Status</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {models.length === 0 && <EmptyRow colSpan={canEdit ? 6 : 5}>No models yet.</EmptyRow>}
              {models.map((m) => (
                <tr key={m.id}>
                  <Td className="font-medium">
                    {m.brand} {m.name}
                  </Td>
                  <Td>{m.rangeKm} km</Td>
                  <Td>{m.topSpeedKmh} km/h</Td>
                  <Td>{m.batteryCapacityWh ? `${m.batteryCapacityWh} Wh` : "–"}</Td>
                  <Td>
                    <StatusChip tone={m.isActive ? "success" : "muted"}>{m.isActive ? "Active" : "Retired"}</StatusChip>
                  </Td>
                  {canEdit && (
                    <Td className="text-right">
                      <RowButton action={setModelActive.bind(null, m.id, !m.isActive)}>
                        {m.isActive ? "Retire" : "Restore"}
                      </RowButton>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="mt-3 text-sm text-ink-muted">Retired models can&apos;t be used for new scooters. Existing scooters keep working.</p>
        </div>

        {canEdit && (
          <Panel title="Add a model">
            <ActionForm action={createModel} submitLabel="Add model" resetOnSuccess>
              <Field label="Brand" name="brand" placeholder="Voltra" required />
              <Field label="Model name" name="name" placeholder="V2" required />
              <Field label="Range (km)" name="rangeKm" type="number" min={1} placeholder="90" required />
              <Field label="Top speed (km/h)" name="topSpeedKmh" type="number" min={1} placeholder="45" required />
              <Field label="Battery (Wh)" name="batteryCapacityWh" type="number" min={1} placeholder="2400" hint="Optional." />
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
