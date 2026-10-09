"use client";

import { useActionState, useState } from "react";
import { collectSettlementAction, noShowAction, pickupAction, retryRefundAction, returnAction } from "@/app/actions/desk";
import { ActionForm, useFormResult } from "@/components/admin/ActionForm";
import { Field, FormGrid, SelectField } from "@/components/admin/Fields";
import { FormMessage } from "@/components/app/FormMessage";
import { Modal } from "@/components/app/Modal";
import { SubmitButton } from "@/components/app/SubmitButton";
import { formatMoney } from "@/lib/format";
import type { FormState } from "@/lib/form";
import type { SettlementView, StaffBookingView } from "@/lib/types";

const SEVERITIES = [
  { value: "MINOR", label: "Minor (scuffs, scratches)" },
  { value: "MODERATE", label: "Moderate (needs a check)" },
  { value: "MAJOR", label: "Major (not safe to ride)" },
];

function Check({ name, label, hint }: { name: string; label: string; hint?: string }) {
  const result = useFormResult();
  const error = result.fieldErrors?.[name];
  return (
    <div className="sm:col-span-2">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name={name}
          // A failed submit resets the form; keep the box ticked so staff do not have to redo it.
          defaultChecked={result.values?.[name] === "on"}
          aria-invalid={error ? true : undefined}
          className="mt-1 size-5 accent-ink"
        />
        <span className="text-sm">
          {label}
          {hint && <span className="block text-ink-muted">{hint}</span>}
        </span>
      </label>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Hand the scooter over: the PIN the customer shows, an ID check, the readings, and any damage already there. */
export function PickupForm({ booking }: { booking: StaffBookingView }) {
  const [swap, setSwap] = useState("");
  const unavailable = booking.vehicle.status !== "AVAILABLE";
  return (
    <ActionForm action={pickupAction.bind(null, booking.id)} submitLabel="Hand over the scooter">
      {unavailable && (
        <p role="alert" className="rounded-control bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The booked scooter ({booking.vehicle.code}) is {booking.vehicle.status.toLowerCase().replace("_", " ")}. Hand over a different scooter of the same model.
        </p>
      )}
      <FormGrid>
        <Field wide label="Customer's PIN" name="pin" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="6 digits" hint="The customer shows this on their booking. Don't ask them to read it out in public." required />
        <Check name="idChecked" label="I checked the customer's ID" hint={`The booking is for ${booking.customer.fullName}.`} />
        <Field label="Odometer (km)" name="startOdometerKm" type="number" min={0} step="0.1" defaultValue={booking.vehicle.odometerKm} required hint="Last recorded reading is prefilled." />
        <Field label="Battery (%)" name="startBatteryPercent" type="number" min={0} max={100} defaultValue={booking.vehicle.batteryPercent ?? ""} required />
        {booking.swapOptions.length > 0 && (
          <SelectField
            wide
            label="Hand over a different scooter (optional)"
            name="replacementVehicleId"
            value={swap}
            onChange={setSwap}
            options={[{ value: "", label: `Keep ${booking.vehicle.code}` }, ...booking.swapOptions.map((v) => ({ value: v.id, label: `${v.code}${v.batteryPercent === null ? "" : ` · ${v.batteryPercent}%`}` }))]}
          />
        )}
        {swap && <Field wide label="Why is it being swapped?" name="swapReason" placeholder="Flat tyre on the booked scooter" required />}
        <Field wide label="Damage already there (optional)" name="damageNote" placeholder="Scratch on the left mirror" />
        <SelectField wide label="How bad is it?" name="damageSeverity" defaultValue="MINOR" options={SEVERITIES} />
      </FormGrid>
    </ActionForm>
  );
}

/** Take the scooter back: where it is parked, the readings, and any new damage. */
export function ReturnForm({ booking }: { booking: StaffBookingView }) {
  const start = booking.rental?.startOdometerKm ?? 0;
  return (
    <ActionForm action={returnAction.bind(null, booking.id)} submitLabel="Complete the return">
      <FormGrid>
        <SelectField
          wide
          label="Returned to"
          name="returnStationId"
          defaultValue={booking.returnStations[0]?.id}
          options={booking.returnStations.map((s) => ({ value: s.id, label: s.name }))}
          required
          hint="Any station in the same city."
        />
        <Field label="Odometer (km)" name="endOdometerKm" type="number" min={start} step="0.1" defaultValue={start} required hint={`It read ${start} km at pickup.`} />
        <Field label="Battery (%)" name="endBatteryPercent" type="number" min={0} max={100} required />
        <Field wide label="New damage (optional)" name="damageNote" placeholder="Bent brake lever" />
        <SelectField label="How bad is it?" name="damageSeverity" defaultValue="MINOR" options={SEVERITIES} hint="Moderate or major sends it to maintenance." />
        <Field label="Damage charge (₹)" name="damageFee" type="number" min={0} step="0.01" placeholder="0" hint="Taken from the deposit." />
        <Check name="sendToMaintenance" label="Take this scooter out of service for a check" />
      </FormGrid>
    </ActionForm>
  );
}

function NoShowConfirm({ booking, onClose }: { booking: StaffBookingView; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(noShowAction.bind(null, booking.id), {});
  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <p className="text-sm">
        The customer didn&apos;t come. Their deposit of <span className="font-semibold">{formatMoney(booking.depositAmount)}</span> is refunded and the rental
        charge of {formatMoney(booking.rentalAmount)} is kept. The scooter becomes free for other customers.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={onClose} className="h-12 rounded-full border border-line bg-surface text-base font-medium transition-colors hover:bg-canvas">
          Not yet
        </button>
        <SubmitButton>Mark as no-show</SubmitButton>
      </div>
    </form>
  );
}

export function NoShowButton({ booking }: { booking: StaffBookingView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-full rounded-full border border-red-200 text-base font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        Mark as no-show
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Mark as no-show?" size="max-w-md">
        <NoShowConfirm booking={booking} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** What staff can do about a bill that is not finished: take the money owed, or send the refund again. */
export function SettlementActions({ settlement, bookingId }: { settlement: SettlementView; bookingId: string }) {
  const collect = settlement.status === "OUTSTANDING";
  const [state, action] = useActionState<FormState, FormData>(
    (collect ? collectSettlementAction : retryRefundAction).bind(null, settlement.id, bookingId),
    {},
  );
  if (!collect && settlement.status !== "REFUND_PENDING") return null;
  return (
    <form action={action} className="mt-5 space-y-3 border-t border-line pt-5">
      <FormMessage state={state} />
      {collect && (
        <p className="text-sm text-ink-muted">
          If the customer pays at the desk, take {formatMoney(settlement.outstandingAmount)} and confirm it here. (Demo: nothing is charged.)
        </p>
      )}
      <SubmitButton>{collect ? `Payment received · ${formatMoney(settlement.outstandingAmount)}` : "Send the refund again"}</SubmitButton>
    </form>
  );
}
