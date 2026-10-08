-- CreateEnum
CREATE TYPE "DamagePhase" AS ENUM ('PICKUP', 'RETURN');

-- CreateEnum
CREATE TYPE "DamageSeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR');

-- AlterEnum
ALTER TYPE "RefundReason" ADD VALUE 'NO_SHOW';

-- CreateTable
CREATE TABLE "Rental" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "pickupStationId" UUID NOT NULL,
    "returnStationId" UUID,
    "pickupEmployeeId" UUID NOT NULL,
    "returnEmployeeId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "startOdometerKm" DOUBLE PRECISION NOT NULL,
    "endOdometerKm" DOUBLE PRECISION,
    "startBatteryPercent" INTEGER NOT NULL,
    "endBatteryPercent" INTEGER,
    "originalVehicleId" UUID,
    "swapReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageRecord" (
    "id" UUID NOT NULL,
    "rentalId" UUID NOT NULL,
    "phase" "DamagePhase" NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "DamageSeverity" NOT NULL,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rental_bookingId_key" ON "Rental"("bookingId");

-- CreateIndex
CREATE INDEX "Rental_vehicleId_idx" ON "Rental"("vehicleId");

-- CreateIndex
CREATE INDEX "Rental_pickupStationId_idx" ON "Rental"("pickupStationId");

-- CreateIndex
CREATE INDEX "DamageRecord_rentalId_idx" ON "DamageRecord"("rentalId");

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_pickupStationId_fkey" FOREIGN KEY ("pickupStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_returnStationId_fkey" FOREIGN KEY ("returnStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_pickupEmployeeId_fkey" FOREIGN KEY ("pickupEmployeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_returnEmployeeId_fkey" FOREIGN KEY ("returnEmployeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageRecord" ADD CONSTRAINT "DamageRecord_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageRecord" ADD CONSTRAINT "DamageRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Rules the database enforces itself ----
ALTER TABLE "Rental"
  ADD CONSTRAINT "Rental_readings_valid" CHECK (
    "startOdometerKm" >= 0 AND "startBatteryPercent" BETWEEN 0 AND 100
    AND ("endOdometerKm" IS NULL OR "endOdometerKm" >= "startOdometerKm")
    AND ("endBatteryPercent" IS NULL OR "endBatteryPercent" BETWEEN 0 AND 100)
  ),
  ADD CONSTRAINT "Rental_end_after_start" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
  -- Returning fills in every return field together.
  ADD CONSTRAINT "Rental_return_complete" CHECK (
    ("endedAt" IS NULL AND "returnStationId" IS NULL AND "returnEmployeeId" IS NULL AND "endOdometerKm" IS NULL AND "endBatteryPercent" IS NULL)
    OR ("endedAt" IS NOT NULL AND "returnStationId" IS NOT NULL AND "returnEmployeeId" IS NOT NULL AND "endOdometerKm" IS NOT NULL AND "endBatteryPercent" IS NOT NULL)
  );
ALTER TABLE "DamageRecord" ADD CONSTRAINT "DamageRecord_fee_valid" CHECK ("feeAmount" >= 0);
