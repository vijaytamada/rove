// After a write scenario the data must still make sense, however many things happened at once. Each check is a query that must
// return 0 rows (or the stated number). This is the part of a load test that finds money and booking bugs, not slow endpoints.
import { sql } from "./env.mjs";

const checks = [
  [
    "no scooter is booked twice for overlapping times",
    `SELECT count(*) FROM "Booking" a JOIN "Booking" b ON a."vehicleId" = b."vehicleId" AND a.id < b.id
     WHERE a.status IN ('PENDING_PAYMENT','CONFIRMED','IN_RIDE') AND b.status IN ('PENDING_PAYMENT','CONFIRMED','IN_RIDE')
       AND tsrange(a."startAt", a."endAt") && tsrange(b."startAt", b."endAt")`,
  ],
  ["no booking was charged twice (more than one successful rental payment)", `SELECT count(*) FROM (SELECT "bookingId" FROM "Payment" WHERE status = 'SUCCEEDED' AND purpose = 'RENTAL_AND_DEPOSIT' GROUP BY 1 HAVING count(*) > 1) x`],
  ["every confirmed, ridden or settled booking has exactly one successful payment", `SELECT count(*) FROM "Booking" b WHERE b.status IN ('CONFIRMED','IN_RIDE','RETURNED','SETTLED') AND (SELECT count(*) FROM "Payment" p WHERE p."bookingId" = b.id AND p.status = 'SUCCEEDED' AND p.purpose = 'RENTAL_AND_DEPOSIT') <> 1`],
  [
    "every cancelled paid booking got back exactly what it paid (cancelled at once, so everything)",
    `SELECT count(*) FROM "Booking" b JOIN "Payment" p ON p."bookingId" = b.id AND p.status = 'SUCCEEDED'
     WHERE b.status = 'CANCELLED' AND COALESCE((SELECT sum(r."refundAmount") FROM "Refund" r WHERE r."paymentId" = p.id AND r.status = 'SUCCEEDED'), 0) <> p."chargeAmount"`,
  ],
  ["no payment is stuck pending", `SELECT count(*) FROM "Payment" WHERE status = 'PENDING' AND "createdAt" < now() - interval '2 minutes'`],
  ["no refund is larger than its payment", `SELECT count(*) FROM (SELECT p.id FROM "Payment" p JOIN "Refund" r ON r."paymentId" = p.id AND r.status = 'SUCCEEDED' GROUP BY p.id, p."chargeAmount" HAVING sum(r."refundAmount") > p."chargeAmount") x`],
  ["every returned or settled ride has exactly one final bill", `SELECT count(*) FROM "Booking" b WHERE b.status IN ('RETURNED','SETTLED') AND b."id" IN (SELECT "bookingId" FROM "Rental") AND (SELECT count(*) FROM "Settlement" s WHERE s."bookingId" = b.id) <> 1`],
  ["every final bill adds up (refund + charges = deposit, or the shortfall is owed)", `SELECT count(*) FROM "Settlement" WHERE ("refundAmount" + "totalCharges" <> "depositHeld" AND "outstandingAmount" = 0) OR ("outstandingAmount" > 0 AND "refundAmount" <> 0)`],
  ["no scooter is stuck as reserved or on a ride without a live booking", `SELECT count(*) FROM "Vehicle" v WHERE v.status IN ('RESERVED','IN_RIDE') AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."vehicleId" = v.id AND b.status IN ('CONFIRMED','IN_RIDE'))`],
  ["no scooter is out (no station) while its status says it is parked", `SELECT count(*) FROM "Vehicle" WHERE "stationId" IS NULL AND status NOT IN ('IN_RIDE','OFFLINE','MAINTENANCE')`],
  ["no customer has two live bookings that overlap in time", `SELECT count(*) FROM "Booking" a JOIN "Booking" b ON a."userId" = b."userId" AND a.id < b.id WHERE a.status IN ('PENDING_PAYMENT','CONFIRMED','IN_RIDE') AND b.status IN ('PENDING_PAYMENT','CONFIRMED','IN_RIDE') AND tsrange(a."startAt", a."endAt") && tsrange(b."startAt", b."endAt")`],
  ["no customer message was stored twice for one event", `SELECT count(*) FROM (SELECT "dedupeKey" FROM "Notification" GROUP BY 1 HAVING count(*) > 1) x`],
];

export async function verifyData() {
  let ok = true;
  for (const [name, query] of checks) {
    const n = Number(sql(query));
    console.log(`${n === 0 ? "PASS" : "FAIL"}  ${name}${n === 0 ? "" : `  (${n} found)`}`);
    if (n !== 0) ok = false;
  }
  const totals = sql(`SELECT 'bookings ' || count(*) || ', payments ' || (SELECT count(*) FROM "Payment") || ', refunds ' || (SELECT count(*) FROM "Refund") || ', rentals ' || (SELECT count(*) FROM "Rental") || ', settlements ' || (SELECT count(*) FROM "Settlement") || ', telemetry points ' || (SELECT count(*) FROM "TelemetryPoint") FROM "Booking"`);
  console.log(`\nData in the load database: ${totals}`);
  return ok;
}
