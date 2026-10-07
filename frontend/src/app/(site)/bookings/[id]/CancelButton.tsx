"use client";

import { useActionState, useState } from "react";
import { cancelBooking } from "@/app/actions/booking";
import { FormMessage } from "@/components/app/FormMessage";
import { Modal } from "@/components/app/Modal";
import { SubmitButton } from "@/components/app/SubmitButton";
import { formatMoney } from "@/lib/format";
import type { FormState } from "@/lib/form";
import type { BookingView } from "@/lib/types";

function CancelForm({ booking, onKeep }: { booking: BookingView; onKeep: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(cancelBooking.bind(null, booking.id), {});
  const { refundAmount, retainedAmount } = booking.cancellation;
  const unpaid = booking.status === "PENDING_PAYMENT";

  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <div className="space-y-2 text-sm">
        {unpaid ? (
          <p>Cancel this booking? Nothing has been charged.</p>
        ) : (
          <>
            <p>
              You&apos;ll get <span className="font-semibold">{formatMoney(refundAmount)}</span> back to your original
              payment method.
            </p>
            {retainedAmount > 0 && (
              <p className="text-ink-muted">
                The {formatMoney(retainedAmount)} rental charge isn&apos;t refunded when you cancel this close to the start
                time. Your deposit comes back in full.
              </p>
            )}
          </>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onKeep}
          className="h-12 rounded-full border border-line bg-surface text-base font-medium transition-colors hover:bg-canvas"
        >
          Keep booking
        </button>
        <SubmitButton>Cancel booking</SubmitButton>
      </div>
    </form>
  );
}

/** "Cancel booking" with a confirmation that spells out the refund (the numbers come from the backend). */
export function CancelButton({ booking }: { booking: BookingView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-full rounded-full border border-red-200 text-base font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        Cancel booking
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cancel this booking?" size="max-w-md">
        <CancelForm booking={booking} onKeep={() => setOpen(false)} />
      </Modal>
    </>
  );
}
