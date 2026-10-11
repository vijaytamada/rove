import { Field, FormGrid } from "@/components/admin/Fields";
import type { PricingPlanView } from "@/lib/types";

/** Rupees as typed in a form: 4900 paise -> "49", 4950 -> "49.5". */
const rupees = (paise: number | null | undefined) => (paise == null ? "" : String(paise / 100));

/** The rate fields shared by "add plan" and "edit plan". Amounts are typed in rupees. */
export function PlanFields({ plan }: { plan?: PricingPlanView }) {
  return (
    <FormGrid>
      <Field label="Rate per hour (₹)" name="hourlyRateAmount" type="number" min={0.01} step="0.01" defaultValue={rupees(plan?.hourlyRateAmount)} placeholder="49" required />
      <Field label="Day rate (₹)" name="dailyRateAmount" type="number" min={0.01} step="0.01" defaultValue={rupees(plan?.dailyRateAmount)} placeholder="299" hint="Optional. The most a long rental costs." />
      <Field label="Included km per hour" name="includedKmPerHour" type="number" min={0} defaultValue={plan?.includedKmPerHour} placeholder="12" required />
      <Field label="Extra km rate (₹ per km)" name="extraKmRateAmount" type="number" min={0} step="0.01" defaultValue={rupees(plan?.extraKmRateAmount)} placeholder="6" required />
      <Field label="Late fee (₹ per extra hour)" name="lateFeePerHourAmount" type="number" min={0} step="0.01" defaultValue={rupees(plan?.lateFeePerHourAmount)} placeholder="99" required />
      <Field label="Grace period (minutes)" name="graceMinutes" type="number" min={0} defaultValue={plan?.graceMinutes ?? 15} required />
      <Field wide label="Refundable deposit (₹)" name="depositAmount" type="number" min={0} step="0.01" defaultValue={rupees(plan?.depositAmount)} placeholder="1000" required />
    </FormGrid>
  );
}
