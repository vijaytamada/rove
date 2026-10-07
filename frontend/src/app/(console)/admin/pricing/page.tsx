import { createPlan } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { AddDialog } from "@/components/admin/AddDialog";
import { SelectField } from "@/components/admin/Fields";
import { PlanFields } from "@/components/admin/PlanFields";
import { EmptyRow, PageHeader, RowLink, TableWrap, Td, Th } from "@/components/admin/ui";
import { StatusChip } from "@/components/app/StatusChip";
import { requireRole } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { apiGet, apiGetAll } from "@/lib/server-api";
import type { CityView, PricingPlanView, VehicleModelView } from "@/lib/types";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const user = await requireRole("/admin/pricing", "CITY_MANAGER", "SUPER_ADMIN");
  const canEdit = user.role === "SUPER_ADMIN";
  const [plans, models, cities] = await Promise.all([
    apiGetAll<PricingPlanView>("/manage/pricing-plans"),
    canEdit ? apiGet<VehicleModelView[]>("/manage/vehicle-models") : Promise.resolve([] as VehicleModelView[]),
    canEdit ? apiGetAll<CityView>("/manage/cities") : Promise.resolve([] as CityView[]),
  ]);

  return (
    <>
      <PageHeader
        title="Pricing"
        description={
          canEdit
            ? "What each scooter model costs. A city plan replaces the default plan in that city."
            : "What each scooter model costs. Super admins change prices."
        }
        action={
          canEdit && (
            <AddDialog label="Add plan" title="Add a pricing plan">
              <ActionForm action={createPlan} submitLabel="Add plan" resetOnSuccess>
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Model"
                    name="modelId"
                    placeholder="Choose a model"
                    options={models.filter((m) => m.isActive).map((m) => ({ value: m.id, label: `${m.brand} ${m.name}` }))}
                    required
                  />
                  <SelectField
                    label="City"
                    name="cityId"
                    defaultValue=""
                    options={[{ value: "", label: "All cities (default plan)" }, ...cities.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </div>
                <PlanFields />
              </ActionForm>
            </AddDialog>
          )
        }
      />

      <TableWrap>
        <thead>
          <tr>
            <Th>Model</Th>
            <Th>City</Th>
            <Th>Per hour</Th>
            <Th>Day rate</Th>
            <Th>Deposit</Th>
            <Th>Status</Th>
            {canEdit && <Th />}
          </tr>
        </thead>
        <tbody>
          {plans.length === 0 && (
            <EmptyRow colSpan={canEdit ? 7 : 6}>No pricing plans yet. Scooters without one can&apos;t be booked.</EmptyRow>
          )}
          {plans.map((p) => (
            <tr key={p.id}>
              <Td label="Model" className="font-medium">
                {p.modelName}
              </Td>
              <Td label="City">{p.cityName ?? "All cities"}</Td>
              <Td label="Per hour">{formatMoney(p.hourlyRateAmount)}</Td>
              <Td label="Day rate">{p.dailyRateAmount === null ? "–" : formatMoney(p.dailyRateAmount)}</Td>
              <Td label="Deposit">{formatMoney(p.depositAmount)}</Td>
              <Td label="Status">
                <StatusChip tone={p.isActive ? "success" : "muted"}>{p.isActive ? "Active" : "Off"}</StatusChip>
              </Td>
              {canEdit && (
                <Td className="text-right">
                  <RowLink href={`/admin/pricing/${p.id}`}>Edit</RowLink>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="mt-3 text-sm text-ink-muted">
        Changing a plan only affects new bookings. A booking keeps the rates it was made with.
      </p>
    </>
  );
}
