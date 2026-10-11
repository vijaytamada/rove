// node tools/load/bulk.mjs [--per-vehicle 8000]
// Fills the load database with a lot of HISTORY, fast, in SQL: for every load scooter, back-to-back one-hour bookings in the past
// (no overlaps), 90% ridden and settled (payment, ride, bill, refund, three notifications, two audit entries) and 10% cancelled
// with a full refund. 40 scooters x 8000 = 320,000 bookings, about a year of a small network. Then run the scenarios and
// `node tools/load/queries.mjs` again to see how the endpoints behave on a database this size.
import { sql } from "./env.mjs";

const perVehicle = Number((process.argv.join(" ").match(/--per-vehicle\s+(\d+)/) ?? [])[1] ?? 8000);
const t0 = Date.now();
const step = (label, statement) => {
  const s = Date.now();
  sql(statement);
  console.log(`${label.padEnd(34)} ${((Date.now() - s) / 1000).toFixed(1)}s`);
};

const staff = sql(`SELECT id FROM "User" WHERE email = 'load-employee@rove.test'`);
if (!staff) throw new Error("Run  node tools/load/run.mjs setup  first");

step("plan of work (temporary table)", `
  DROP TABLE IF EXISTS bulk_b;
  CREATE TABLE bulk_b AS
  WITH people AS (SELECT array_agg(id ORDER BY "createdAt") AS ids FROM "User" WHERE "fullName" LIKE 'load-user-%'),
       plan AS (SELECT id, "hourlyRateAmount", "dailyRateAmount", "includedKmPerHour", "extraKmRateAmount", "graceMinutes", "lateFeePerHourAmount", "depositAmount"
                FROM "PricingPlan" WHERE "modelId" = (SELECT "modelId" FROM "Vehicle" WHERE code = 'LOAD-001') AND "cityId" IS NULL LIMIT 1),
       slots AS (
         SELECT v.id AS vehicle_id, v."stationId" AS station_id, g AS n, row_number() OVER (ORDER BY v.id, g) AS rn
         FROM "Vehicle" v CROSS JOIN generate_series(1, ${perVehicle}) g WHERE v.code LIKE 'LOAD-%')
  SELECT gen_random_uuid() AS booking_id, gen_random_uuid() AS payment_id, gen_random_uuid() AS rental_id, gen_random_uuid() AS settlement_id,
         s.rn, s.vehicle_id, s.station_id,
         people.ids[1 + (s.rn % cardinality(people.ids))::int] AS user_id,
         now() - ((s.n + 48) * interval '1 hour') AS start_at,
         (s.rn % 10 = 0) AS cancelled,
         plan.id AS plan_id, plan."hourlyRateAmount" AS rate, plan."depositAmount" AS deposit,
         to_jsonb(plan) AS snapshot
  FROM slots s, people, plan`);
step("index on the plan", `CREATE INDEX ON bulk_b (rn)`);

step("bookings", `
  INSERT INTO "Booking" (id, code, "userId", "vehicleId", "stationId", status, "startAt", "endAt", hours, "rentalAmount", "depositAmount", "totalAmount",
                         "pricingSnapshot", "confirmedAt", "cancelledAt", "createdAt", "updatedAt")
  SELECT booking_id, 'LB' || lpad(rn::text, 8, '0'), user_id, vehicle_id, station_id,
         CASE WHEN cancelled THEN 'CANCELLED' ELSE 'SETTLED' END::"BookingStatus",
         start_at, start_at + interval '1 hour', 1, rate, deposit, rate + deposit,
         jsonb_build_object('planId', plan_id) || snapshot,
         start_at - interval '2 hours', CASE WHEN cancelled THEN start_at - interval '1 hour 50 minutes' END,
         start_at - interval '2 hours', start_at + interval '1 hour'
  FROM bulk_b`);
step("payments", `
  INSERT INTO "Payment" (id, "bookingId", purpose, "chargeAmount", status, provider, "providerRef", "paidAt", "createdAt", "updatedAt")
  SELECT payment_id, booking_id, 'RENTAL_AND_DEPOSIT', rate + deposit, 'SUCCEEDED', 'mock', 'mock_' || rn, start_at - interval '2 hours', start_at - interval '2 hours', start_at - interval '2 hours'
  FROM bulk_b`);
step("rides", `
  INSERT INTO "Rental" (id, "bookingId", "vehicleId", "pickupStationId", "returnStationId", "pickupEmployeeId", "returnEmployeeId", "startedAt", "endedAt",
                        "startOdometerKm", "endOdometerKm", "startBatteryPercent", "endBatteryPercent", "createdAt", "updatedAt")
  SELECT rental_id, booking_id, vehicle_id, station_id, station_id, '${staff}', '${staff}', start_at + interval '2 minutes', start_at + interval '55 minutes',
         rn * 0.01, rn * 0.01 + 6, 90, 70, start_at, start_at + interval '55 minutes'
  FROM bulk_b WHERE NOT cancelled`);
step("final bills", `
  INSERT INTO "Settlement" (id, "bookingId", "depositHeld", "totalCharges", "refundAmount", "outstandingAmount", status, "settledAt", "createdAt", "updatedAt")
  SELECT settlement_id, booking_id, deposit, 0, deposit, 0, 'REFUNDED', start_at + interval '56 minutes', start_at + interval '55 minutes', start_at + interval '56 minutes'
  FROM bulk_b WHERE NOT cancelled`);
step("refunds", `
  INSERT INTO "Refund" (id, "paymentId", "refundAmount", status, reason, provider, "providerRef", "createdAt")
  SELECT gen_random_uuid(), payment_id, CASE WHEN cancelled THEN rate + deposit ELSE deposit END, 'SUCCEEDED',
         CASE WHEN cancelled THEN 'CANCELLATION' ELSE 'DEPOSIT_RETURN' END::"RefundReason", 'mock', 'mock_r_' || rn,
         CASE WHEN cancelled THEN start_at - interval '1 hour 50 minutes' ELSE start_at + interval '56 minutes' END
  FROM bulk_b`);
step("notifications", `
  INSERT INTO "Notification" (id, "userId", type, title, body, "bookingId", "dedupeKey", "readAt", "createdAt")
  SELECT gen_random_uuid(), user_id, t.type::"NotificationType", 'Load test message', 'Generated for the load test.', booking_id, t.type || ':' || booking_id,
         CASE WHEN rn % 3 = 0 THEN NULL ELSE start_at END, start_at - interval '2 hours' + t.offs
  FROM bulk_b, (VALUES ('BOOKING_CONFIRMED', interval '0'), ('RIDE_STARTED', interval '2 hours'), ('RIDE_COMPLETED', interval '3 hours')) AS t(type, offs)
  WHERE NOT cancelled`);
step("audit entries", `
  INSERT INTO "AuditLog" (id, "actorId", "actorRole", action, "entityType", "entityId", route, "createdAt")
  SELECT gen_random_uuid(), '${staff}', 'STATION_EMPLOYEE', t.action, 'booking', booking_id::text, t.route, start_at + t.offs
  FROM bulk_b, (VALUES ('BOOKING_PICKUP', 'POST /station/bookings/:id/pickup', interval '2 minutes'), ('BOOKING_RETURN', 'POST /station/bookings/:id/return', interval '55 minutes')) AS t(action, route, offs)
  WHERE NOT cancelled`);
step("tidy up", `DROP TABLE bulk_b`);
step("analyze (refresh statistics)", `ANALYZE`);

console.log(`\nTotal ${((Date.now() - t0) / 1000).toFixed(0)}s. Row counts:`);
console.log(sql(`SELECT 'Booking ' || (SELECT count(*) FROM "Booking") || ', Payment ' || (SELECT count(*) FROM "Payment") || ', Rental ' || (SELECT count(*) FROM "Rental") || ', Settlement ' || (SELECT count(*) FROM "Settlement") || ', Refund ' || (SELECT count(*) FROM "Refund") || ', Notification ' || (SELECT count(*) FROM "Notification") || ', AuditLog ' || (SELECT count(*) FROM "AuditLog")`));
