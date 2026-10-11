// node tools/load/queries.mjs [--show]
// How many database statements does each endpoint run for ONE request? Turns on statement logging for the load database, makes
// one request per endpoint (one at a time), and counts the statements Postgres logged for it. Needs the load server and fixtures.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DEVICE_KEY, LOAD_DB, PG_USER, sql } from "./env.mjs";
import { customerTokens, loadFixture, staffTokens } from "./fixtures.mjs";
import { API, Stats, request, sleep } from "./lib.mjs";

const show = process.argv.includes("--show");
const f = loadFixture();
const [token] = await customerTokens(1);
const { employee, admin } = await staffTokens();
const stats = new Stats();
const r = (method, path, opts) => request(stats, "q", method, path, opts);

// A paid booking to look at, and a ride to hand over and take back, so the desk endpoints have something real.
const made = await r("POST", "/bookings", { token, body: { vehicleId: f.vehicleIds[0], hours: 1 } });
const bookingId = made.data.id;
const paid = await r("POST", `/bookings/${bookingId}/pay`, { token, body: {}, headers: { "Idempotency-Key": randomUUID() } });
const odo = (await r("GET", `/station/bookings/${bookingId}`, { token: employee })).data.vehicle.odometerKm;

const calls = [
  ["GET /cities", () => r("GET", "/cities")],
  ["GET /cities/:id/stations", () => r("GET", `/cities/${f.cityId}/stations`)],
  ["GET /stations/:id/vehicles", () => r("GET", `/stations/${f.stationIds[0]}/vehicles`)],
  ["GET /vehicles/:id", () => r("GET", `/vehicles/${f.vehicleIds[5]}`)],
  ["POST /bookings/quote", () => r("POST", "/bookings/quote", { body: { vehicleId: f.vehicleIds[5], hours: 2 } })],
  ["GET /me", () => r("GET", "/me", { token })],
  ["GET /notifications/unread-count", () => r("GET", "/notifications/unread-count", { token })],
  ["GET /bookings?tab=active", () => r("GET", "/bookings?tab=active", { token })],
  ["GET /bookings?tab=past", () => r("GET", "/bookings?tab=past&limit=20", { token })],
  ["GET /bookings/:id", () => r("GET", `/bookings/${bookingId}`, { token })],
  ["GET /dashboard/customer", () => r("GET", "/dashboard/customer", { token })],
  ["GET /station/bookings (desk)", () => r("GET", `/station/bookings?tab=pickups&stationId=${f.stationIds[0]}`, { token: employee })],
  ["GET /station/bookings/:id", () => r("GET", `/station/bookings/${bookingId}`, { token: employee })],
  ["GET /settlements", () => r("GET", "/settlements", { token: employee })],
  ["GET /fleet/live", () => r("GET", "/fleet/live", { token: employee })],
  ["GET /dashboard/station/:id", () => r("GET", `/dashboard/station/${f.stationIds[0]}`, { token: employee })],
  ["GET /dashboard/admin", () => r("GET", "/dashboard/admin", { token: admin })],
  ["POST /telemetry (50 readings)", () => r("POST", "/telemetry", { headers: { "x-device-key": DEVICE_KEY }, body: { readings: Array.from({ length: 50 }, (_, i) => ({ vehicleId: f.vehicleIds[i % 40], recordedAt: new Date(Date.now() - 3000 - i * 11 - Math.random() * 5).toISOString(), latitude: 12.9, longitude: 77.6, speedKmh: 10, batteryPercent: 50, odometerKm: 100, ignition: true })) } })],
  ["POST /station/bookings/:id/pickup", () => r("POST", `/station/bookings/${bookingId}/pickup`, { token: employee, body: { pin: paid.data.pin, idChecked: true, startOdometerKm: odo, startBatteryPercent: 90 } })],
  ["POST /station/bookings/:id/return", () => r("POST", `/station/bookings/${bookingId}/return`, { token: employee, body: { returnStationId: f.stationIds[0], endOdometerKm: odo + 10, endBatteryPercent: 60 } })],
  ["POST /bookings (new hold)", async () => (await r("POST", "/bookings", { token, body: { vehicleId: f.vehicleIds[7], hours: 1 } })).data],
];

sql(`ALTER DATABASE ${LOAD_DB} SET log_statement = 'all'`, "postgres");
await sleep(500);
// New connections pick the setting up; the server's pool reconnects lazily, so warm every pooled connection first.
for (let i = 0; i < 40; i++) await r("GET", "/cities");
sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
await sleep(500);
for (let i = 0; i < 20; i++) await r("GET", "/cities");

console.log(`${"endpoint".padEnd(36)}statements`);
let hold;
for (const [label, call] of calls) {
  await sleep(250);
  const since = new Date().toISOString();
  const res = await call();
  if (label.startsWith("POST /bookings (new hold)")) hold = res;
  await sleep(350);
  // Postgres writes its log to stderr, so read both streams.
  const out = spawnSync("docker", ["logs", "--since", since, "rove-postgres"], { encoding: "utf8" });
  const logs = `${out.stdout}
${out.stderr}`;
  const lines = logs.split("\n").filter((l) => /LOG:\s+(execute|statement)/.test(l) && !l.includes("pg_stat_activity") && !l.includes("pg_terminate"));
  console.log(`${label.padEnd(36)}${String(lines.length).padStart(4)}`);
  if (show) for (const l of lines) console.log("      " + l.replace(/^.*LOG:\s+/, "").slice(0, 170));
}
if (hold?.id) await r("POST", `/bookings/${hold.id}/cancel`, { token, body: {} });
sql(`ALTER DATABASE ${LOAD_DB} RESET log_statement`, "postgres");
console.log("\n(statement logging switched off again)");
