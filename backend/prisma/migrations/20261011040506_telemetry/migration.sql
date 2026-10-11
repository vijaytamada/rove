-- CreateTable
CREATE TABLE "TelemetryPoint" (
    "id" BIGSERIAL NOT NULL,
    "vehicleId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speedKmh" DOUBLE PRECISION NOT NULL,
    "batteryPercent" INTEGER NOT NULL,
    "odometerKm" DOUBLE PRECISION NOT NULL,
    "ignition" BOOLEAN NOT NULL,

    CONSTRAINT "TelemetryPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetryPoint_vehicleId_recordedAt_idx" ON "TelemetryPoint"("vehicleId", "recordedAt");

-- CreateIndex
CREATE INDEX "TelemetryPoint_recordedAt_idx" ON "TelemetryPoint"("recordedAt");

-- AddForeignKey
ALTER TABLE "TelemetryPoint" ADD CONSTRAINT "TelemetryPoint_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
