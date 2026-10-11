-- One successful deposit refund per payment: a retry or a parallel call can never send the deposit back twice.
CREATE UNIQUE INDEX "Refund_one_deposit_return" ON "Refund" ("paymentId") WHERE "reason" = 'DEPOSIT_RETURN' AND "status" = 'SUCCEEDED';
