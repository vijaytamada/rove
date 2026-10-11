-- CreateIndex
CREATE INDEX "Booking_confirmedAt_idx" ON "Booking"("confirmedAt");

-- CreateIndex
CREATE INDEX "Booking_cancelledAt_idx" ON "Booking"("cancelledAt");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Rental_startedAt_idx" ON "Rental"("startedAt");

-- CreateIndex
CREATE INDEX "Rental_endedAt_idx" ON "Rental"("endedAt");

-- Partial indexes: only the few rows the dashboards look at "right now" (a handful of live bookings among hundreds of thousands
-- of finished ones), so they stay tiny and fast.
CREATE INDEX "Booking_live_idx" ON "Booking"("status", "stationId") WHERE "status" IN ('CONFIRMED', 'IN_RIDE', 'RETURNED');
CREATE INDEX "Booking_no_show_updated_idx" ON "Booking"("updatedAt") WHERE "status" = 'NO_SHOW';
