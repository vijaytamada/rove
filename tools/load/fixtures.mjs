// Creates the data the scenarios use, through the public API (so the setup itself exercises sign-up, KYC and the admin console),
// and loads it back later. Everything lives in the load database, which `prepare.mjs --drop` removes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENV, HERE } from "./env.mjs";
import { API, Stats, request, sleep } from "./lib.mjs";

const FILE = resolve(HERE, ".run/fixture.json");
export const EMPLOYEE_EMAIL = "load-employee@rove.test";
export const EMPLOYEE_PASSWORD = "Load-Employee-12345";

const api = async (method, path, opts) => {
  const r = await request(new Stats(), "setup", method, path, opts);
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

/** Runs `fn` for every item with at most `n` in flight. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export async function adminToken() {
  const r = await api("POST", "/auth/login", { body: { email: ENV.SEED_ADMIN_EMAIL, password: ENV.SEED_ADMIN_PASSWORD } });
  return r.accessToken;
}

export async function setupFixtures({ customers = 150, vehicles = 40 } = {}) {
  const t0 = Date.now();
  const admin = await adminToken();
  const post = (path, body) => api("POST", path, { token: admin, body });

  const city = await post("/cities", { name: "load-city", state: "Load" });
  const stations = [];
  for (const [i, [lat, lng]] of [[12.97, 77.64], [12.93, 77.62]].entries()) {
    stations.push(await post("/stations", { cityId: city.id, name: `load-station-${i + 1}`, address: "1 Load Road", latitude: lat, longitude: lng, capacity: 500 }));
  }
  const model = await post("/vehicle-models", { brand: "load", name: "L1", rangeKm: 80, topSpeedKmh: 45 });
  await post("/pricing-plans", { modelId: model.id, hourlyRateAmount: 5000, dailyRateAmount: 30000, includedKmPerHour: 12, extraKmRateAmount: 600, graceMinutes: 15, lateFeePerHourAmount: 9900, depositAmount: 100000 });
  const scooters = await pool(Array.from({ length: vehicles }, (_, i) => i), 8, (i) =>
    post("/vehicles", { modelId: model.id, stationId: stations[0].id, code: `LOAD-${String(i + 1).padStart(3, "0")}`, batteryPercent: 90, odometerKm: 100 }),
  );
  await post("/users", { email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASSWORD, fullName: "load-employee", role: "STATION_EMPLOYEE", assignments: stations.map((s) => ({ stationId: s.id })) });

  // Customers sign up like real ones (phone, one-time code, name) and pass the identity check.
  const people = await pool(Array.from({ length: customers }, (_, i) => i), 10, async (i) => {
    const phone = `+91980000${String(i).padStart(4, "0")}`;
    await api("POST", "/auth/phone/request", { body: { phone } });
    const verified = await api("POST", "/auth/phone/verify", { body: { phone, code: "123456" } });
    const signed = await api("POST", "/auth/phone/signup", { body: { signupToken: verified.signupToken, fullName: `load-user-${i}` } });
    await api("POST", "/kyc/start", { token: signed.accessToken, body: { consent: true } });
    return { phone, refreshToken: signed.refreshToken };
  });

  const fixture = {
    cityId: city.id,
    stationIds: stations.map((s) => s.id),
    vehicleIds: scooters.map((v) => v.id),
    customers: people,
  };
  writeFileSync(FILE, JSON.stringify(fixture));
  console.log(`Created 1 city, 2 stations, ${vehicles} scooters, 1 employee and ${customers} verified customers in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return fixture;
}

export function loadFixture() {
  if (!existsSync(FILE)) throw new Error("No fixtures yet: run  node tools/load/run.mjs setup");
  return JSON.parse(readFileSync(FILE, "utf8"));
}

/** Fresh access tokens for the first `n` customers (their refresh tokens rotate, so the new ones are saved). */
export async function customerTokens(n) {
  const fixture = loadFixture();
  const people = fixture.customers.slice(0, n);
  const tokens = await pool(people, 10, async (p) => {
    for (let attempt = 0; ; attempt++) {
      const r = await request(new Stats(), "refresh", "POST", "/auth/refresh", { body: { refreshToken: p.refreshToken } });
      if (r.status === 200) {
        p.refreshToken = r.data.refreshToken;
        return r.data.accessToken;
      }
      if (attempt >= 2) throw new Error(`could not refresh ${p.phone}: ${r.status}`);
      await sleep(300);
    }
  });
  writeFileSync(FILE, JSON.stringify(fixture));
  return tokens;
}

export async function staffTokens() {
  const login = (email, password) => api("POST", "/auth/login", { body: { email, password } }).then((r) => r.accessToken);
  return { employee: await login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD), admin: await login(ENV.SEED_ADMIN_EMAIL, ENV.SEED_ADMIN_PASSWORD) };
}

export { API };
