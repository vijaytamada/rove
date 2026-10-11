-- A tracker that sends the same reading twice (a retry) stores it once.
DROP INDEX "TelemetryPoint_vehicleId_recordedAt_idx";
CREATE UNIQUE INDEX "TelemetryPoint_vehicleId_recordedAt_key" ON "TelemetryPoint"("vehicleId", "recordedAt");
