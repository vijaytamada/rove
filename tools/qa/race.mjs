import { ACCOUNTS, clearOtpLimits } from "./env.mjs";
// Concurrency probes against the running API. Creates e2e- prefixed data and cleans it up via SQL afterwards.
import { execSync } from "node:child_process";
const BASE = "http://localhost:3001/api/v1";
const j = async (method, path, token, body) => {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  return { status: res.status, data: t ? JSON.parse(t) : null };
};
const login = async () => (await (await fetch(BASE + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@rove.local", password: ACCOUNTS.admin[1] }) })).json()).accessToken;
const admin = await login();
const rid = Math.random().toString(36).slice(2, 8);
const out = [];

const city = (await j("POST", "/cities", admin, { name: `e2e-race-city-${rid}`, state: "Race" })).data;
const station = (await j("POST", "/stations", admin, { cityId: city.id, name: `e2e-race-station-${rid}`, address: "x", latitude: 1, longitude: 1, capacity: 3 })).data;
const model = (await j("POST", "/vehicle-models", admin, { brand: `e2e-race-${rid}`, name: "R1", rangeKm: 10, topSpeedKmh: 10 })).data;

// 1. Capacity: station holds 3; fire 15 creates at once.
const creates = await Promise.all(Array.from({ length: 15 }, (_, i) =>
  j("POST", "/vehicles", admin, { modelId: model.id, stationId: station.id, code: `E2E-R${rid.toUpperCase()}-${i}` })));
const created = creates.filter((r) => r.status === 201).length;
const full = creates.filter((r) => r.status === 409).length;
const other = creates.filter((r) => ![201, 409].includes(r.status)).map((r) => r.status);
const count = Number(execSync(`docker exec rove-postgres psql -U rove -d rove -tAc "select count(*) from \\"Vehicle\\" where \\"stationId\\"='${station.id}'"`).toString().trim());
out.push([`capacity: 15 parallel creates into a 3-slot station`, count <= 3, `created=${created} full=${full} other=[${other}] rows in DB=${count}`]);

// 2. Duplicate code race.
const dupCode = `E2E-D${rid.toUpperCase()}`;
const station2 = (await j("POST", "/stations", admin, { cityId: city.id, name: `e2e-race-station2-${rid}`, address: "x", latitude: 1, longitude: 1, capacity: 50 })).data;
const dups = await Promise.all(Array.from({ length: 10 }, () => j("POST", "/vehicles", admin, { modelId: model.id, stationId: station2.id, code: dupCode })));
const ok201 = dups.filter((r) => r.status === 201).length;
const bad = dups.filter((r) => ![201, 409].includes(r.status)).map((r) => r.status);
out.push([`duplicate code: 10 parallel creates, same code`, ok201 === 1 && bad.length === 0, `201s=${ok201} others=[${bad}]`]);

// 3. Parallel status changes + moves on one vehicle.
const v = dups.find((r) => r.status === 201).data;
const mix = await Promise.all([
  j("PATCH", `/vehicles/${v.id}/status`, admin, { status: "MAINTENANCE" }),
  j("PATCH", `/vehicles/${v.id}/status`, admin, { status: "OFFLINE" }),
  j("PATCH", `/vehicles/${v.id}/status`, admin, { status: "AVAILABLE" }),
  j("PATCH", `/vehicles/${v.id}`, admin, { batteryPercent: 50 }),
]);
out.push([`parallel status/update on one vehicle -> no 5xx`, mix.every((r) => r.status < 500), mix.map((r) => r.status).join(",")]);

// 4. Parallel duplicate city/station/model creation.
const cities = await Promise.all(Array.from({ length: 6 }, () => j("POST", "/cities", admin, { name: `e2e-race-dupcity-${rid}`, state: "Race" })));
out.push([`duplicate city: 6 parallel creates`, cities.filter((r) => r.status === 201).length === 1 && cities.every((r) => [201, 409].includes(r.status)), cities.map((r) => r.status).join(",")]);

// 5. Sign-ups racing for one new phone number. Two tickets for the same number (a second code was
//    requested), 4 parallel sign-ups each: the unique phone constraint must give exactly one account, no 5xx.
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const phone = `+9199977${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
const ticket = async () => {
  clearOtpLimits(phone);
  await post("/auth/phone/request", { phone });
  return (await (await post("/auth/phone/verify", { phone, code: "123456" })).json()).signupToken;
};
const [ticketA, ticketB] = [await ticket(), await ticket()];
const signups = await Promise.all(
  [ticketA, ticketA, ticketA, ticketA, ticketB, ticketB, ticketB, ticketB].map((signupToken) =>
    post("/auth/phone/signup", { signupToken, fullName: "e2e-race" }).then(async (r) => ({ s: r.status, b: await r.json() })),
  ),
);
const won = signups.filter((r) => r.s === 200);
out.push([`new phone: 8 parallel sign-ups, 2 tickets`, won.length === 1 && signups.every((r) => r.s < 500 && [200, 400, 409].includes(r.s)), signups.map((r) => r.s).join(",")]);

// 6. Parallel refresh with one token (browser tabs): exactly one wins, session survives.
const lg = won[0]?.b ?? {};
const refs = await Promise.all(Array.from({ length: 6 }, () => fetch(BASE + "/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: lg.refreshToken }) }).then(async (r) => ({ s: r.status, b: await r.json() }))));
const winner = refs.find((r) => r.s === 200);
const winnerStillValid = winner ? (await fetch(BASE + "/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: winner.b.refreshToken }) })).status === 200 : false;
out.push([`parallel refresh: one wins, new session not revoked`, refs.filter((r) => r.s === 200).length === 1 && winnerStillValid, refs.map((r) => r.s).join(",") + ` winnerValid=${winnerStillValid}`]);

// Cleanup.
const sql = `
delete from "Vehicle" where code like 'E2E-R%' or code like 'E2E-D%';
delete from "Station" where name like 'e2e-race-%';
delete from "City" where name like 'e2e-race-%';
delete from "VehicleModel" where brand like 'e2e-race-%';
delete from "User" where phone = '${phone}';`;
execSync(`docker exec -i rove-postgres psql -U rove -d rove`, { input: sql });

let bad2 = 0;
for (const [name, ok, detail] of out) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`); if (!ok) bad2++; }
process.exit(bad2 ? 1 : 0);
