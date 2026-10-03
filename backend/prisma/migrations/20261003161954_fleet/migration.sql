-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SCOOTER');

-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_RIDE', 'MAINTENANCE', 'OFFLINE');

-- CreateTable
CREATE TABLE "City" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" UUID NOT NULL,
    "cityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "status" "StationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleModel" (
    "id" UUID NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'SCOOTER',
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rangeKm" INTEGER NOT NULL,
    "topSpeedKmh" INTEGER NOT NULL,
    "batteryCapacityWh" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "stationId" UUID,
    "code" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "batteryPercent" INTEGER,
    "odometerKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_name_state_key" ON "City"("name", "state");

-- CreateIndex
CREATE INDEX "Station_cityId_idx" ON "Station"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Station_cityId_name_key" ON "Station"("cityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_brand_name_key" ON "VehicleModel"("brand", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_code_key" ON "Vehicle"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNumber_key" ON "Vehicle"("registrationNumber");

-- CreateIndex
CREATE INDEX "Vehicle_stationId_status_idx" ON "Vehicle"("stationId", "status");

-- CreateIndex
CREATE INDEX "Vehicle_modelId_idx" ON "Vehicle"("modelId");

-- CreateIndex
CREATE INDEX "StaffAssignment_cityId_idx" ON "StaffAssignment"("cityId");

-- CreateIndex
CREATE INDEX "StaffAssignment_stationId_idx" ON "StaffAssignment"("stationId");

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Value sanity checks (the API validates too; these protect the data from any other writer).
ALTER TABLE "Station"
  ADD CONSTRAINT "Station_capacity_positive" CHECK ("capacity" > 0),
  ADD CONSTRAINT "Station_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "Station_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_battery_range" CHECK ("batteryPercent" IS NULL OR "batteryPercent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Vehicle_odometer_nonnegative" CHECK ("odometerKm" >= 0);
