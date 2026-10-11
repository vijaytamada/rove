import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updatePlan } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { SelectField } from "@/components/admin/Fields";
import { PlanFields } from "@/components/admin/PlanFields";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";
import { apiGetAll } from "@/lib/server-api";
import type { PricingPlanView } from "@/lib/types";

export const metadata = { title: "Edit pricing plan" };
export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("/admin/pricing", "SUPER_ADMIN");
  const { id } = await params;
  const plan = (await apiGetAll<PricingPlanView>("/manage/pricing-plans")).find((p) => p.id === id);
  if (!plan) notFound();

  return (
    <>
      <Link href="/admin/pricing" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Pricing
      </Link>
      <PageHeader
        title={`${plan.modelName} · ${plan.cityName ?? "All cities"}`}
        description="The model and city of a plan can't be changed. Changes only affect new bookings."
      />
      <Panel className="max-w-2xl">
        <ActionForm action={updatePlan.bind(null, plan.id)} submitLabel="Save changes">
          <PlanFields plan={plan} />
          <SelectField
            label="Status"
            name="status"
            defaultValue={plan.isActive ? "ACTIVE" : "OFF"}
            options={[
              { value: "ACTIVE", label: "Active (used for new bookings)" },
              { value: "OFF", label: "Off (the default plan applies instead)" },
            ]}
          />
        </ActionForm>
      </Panel>
    </>
  );
}
