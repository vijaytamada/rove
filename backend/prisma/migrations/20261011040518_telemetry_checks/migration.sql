-- A reading must be physically possible; the API validates the same limits, the database is the last line of defence.
ALTER TABLE "TelemetryPoint"
  ADD CONSTRAINT "TelemetryPoint_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "TelemetryPoint_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "TelemetryPoint_speed_range" CHECK ("speedKmh" BETWEEN 0 AND 200),
  ADD CONSTRAINT "TelemetryPoint_battery_range" CHECK ("batteryPercent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "TelemetryPoint_odometer_positive" CHECK ("odometerKm" >= 0);
