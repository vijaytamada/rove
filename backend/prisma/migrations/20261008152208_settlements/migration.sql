-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('REFUND_PENDING', 'REFUNDED', 'OUTSTANDING', 'CLEARED', 'NO_ACTION');

-- CreateEnum
CREATE TYPE "SettlementLineType" AS ENUM ('EXTRA_KM', 'LATE_FEE', 'DAMAGE');

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "depositHeld" INTEGER NOT NULL,
    "totalCharges" INTEGER NOT NULL,
    "refundAmount" INTEGER NOT NULL,
    "outstandingAmount" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL,
    "settledAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLineItem" (
    "id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "type" "SettlementLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "SettlementLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_bookingId_key" ON "Settlement"("bookingId");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateIndex
CREATE INDEX "SettlementLineItem_settlementId_idx" ON "SettlementLineItem"("settlementId");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLineItem" ADD CONSTRAINT "SettlementLineItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Rules the database enforces itself ----
ALTER TABLE "Settlement"
  ADD CONSTRAINT "Settlement_amounts_valid" CHECK (
    "depositHeld" >= 0 AND "totalCharges" >= 0 AND "refundAmount" >= 0 AND "outstandingAmount" >= 0
  ),
  -- Money goes one way: back to the customer or owed by them, never both.
  ADD CONSTRAINT "Settlement_one_direction" CHECK ("refundAmount" = 0 OR "outstandingAmount" = 0),
  -- Charges are taken from the deposit, so the three amounts always add up.
  ADD CONSTRAINT "Settlement_adds_up" CHECK (
    "refundAmount" = GREATEST("depositHeld" - "totalCharges", 0)
    AND "outstandingAmount" = GREATEST("totalCharges" - "depositHeld", 0)
  ),
  -- A status only fits the amounts it describes.
  ADD CONSTRAINT "Settlement_status_fits" CHECK (
    ("status" IN ('REFUND_PENDING', 'REFUNDED') AND "refundAmount" > 0)
    OR ("status" IN ('OUTSTANDING', 'CLEARED') AND "outstandingAmount" > 0)
    OR ("status" = 'NO_ACTION' AND "refundAmount" = 0 AND "outstandingAmount" = 0)
  );
ALTER TABLE "SettlementLineItem"
  ADD CONSTRAINT "SettlementLineItem_valid" CHECK ("quantity" >= 1 AND "unitAmount" >= 0 AND "amount" = "quantity" * "unitAmount");
