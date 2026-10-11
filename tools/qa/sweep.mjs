import { ACCOUNTS, loginPhone } from "./env.mjs";
// API security/robustness sweep against the running backend (http://localhost:3001).
const BASE = "http://localhost:3001";
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

const j = async (method, path, { token, body, headers = {}, raw } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers, text };
};
const login = async (email, password) => (await j("POST", "/api/v1/auth/login", { body: { email, password } })).data.accessToken;

const admin = await login("admin@rove.local", ACCOUNTS.admin[1]);
const customer = await loginPhone(BASE + "/api/v1", ACCOUNTS.customer.phone);
const manager = await login("manager.hyd@rove.local", ACCOUNTS.manager[1]);
const employee = await login("employee.indiranagar@rove.local", ACCOUNTS.manager[1]);

// 1. Every route in the OpenAPI spec: unauthenticated and wrong-role behaviour.
const spec = (await j("GET", "/api/docs-json")).data;
const uuid = "00000000-0000-4000-8000-000000000000";
const publicPaths = new Set(["/api/v1/health", "/api/v1/auth/phone/request", "/api/v1/auth/phone/verify", "/api/v1/auth/phone/signup", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/cities", "/api/v1/cities/{cityId}/stations", "/api/v1/stations/{id}", "/api/v1/stations/{stationId}/vehicles", "/api/v1/vehicles/{id}", "/api/v1/bookings/quote", "/api/v1/telemetry"]);
// Customer-only routes: a customer is allowed in (checked below that staff are not).
const customerOnly = new Set(["/api/v1/kyc/status", "/api/v1/kyc/start", "/api/v1/bookings", "/api/v1/bookings/{id}", "/api/v1/bookings/{id}/pay", "/api/v1/bookings/{id}/cancel", "/api/v1/bookings/{id}/settlement", "/api/v1/bookings/{id}/settlement/pay", "/api/v1/dashboard/customer"]);
let routeCount = 0;
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const method of Object.keys(methods)) {
    routeCount++;
    const url = path.replace(/\{[^}]+\}/g, uuid);
    const m = method.toUpperCase();
    const body = m === "GET" || m === "DELETE" ? undefined : {};
    const anon = await j(m, url, { body });
    if (!publicPaths.has(path)) {
      check(`anon ${m} ${path} -> 401`, anon.status === 401, `got ${anon.status}`);
      const cust = await j(m, url, { token: customer, body });
      const allowedForCustomer = ["/api/v1/me", "/api/v1/auth/otp/send", "/api/v1/auth/otp/verify", "/api/v1/auth/phone/change", "/api/v1/auth/phone/change/verify", "/api/v1/notifications", "/api/v1/notifications/unread-count", "/api/v1/notifications/read-all", "/api/v1/notifications/{id}/read"].includes(path) || customerOnly.has(path);
      if (customerOnly.has(path)) {
        for (const [who, token] of [["admin", admin], ["manager", manager], ["employee", employee]]) {
          check(`${who} ${m} ${path} -> 403 (customers only)`, (await j(m, url, { token, body })).status === 403);
        }
      }
      if (!allowedForCustomer) check(`customer ${m} ${path} -> 403`, cust.status === 403, `got ${cust.status}`);
    }
  }
}
check(`checked ${routeCount} routes from OpenAPI`, routeCount > 30);

// 1b. Notifications are private to the signed-in user: staff have their own (empty) inbox and cannot read a customer's.
const note = (await j("GET", "/api/v1/notifications?limit=1", { token: customer })).data;
check("customer inbox is a page of messages", Array.isArray(note.items) && typeof note.total === "number");
check("unread count is a number", typeof (await j("GET", "/api/v1/notifications/unread-count", { token: customer })).data.count === "number");
check("staff inbox is empty", (await j("GET", "/api/v1/notifications", { token: employee })).data.total === 0);
if (note.items[0]) {
  const mine = note.items[0].id;
  check("staff cannot mark a customer's message read (404)", (await j("POST", `/api/v1/notifications/${mine}/read`, { token: employee, body: {} })).status === 404);
}
check("a bad notifications filter is a clean 400", (await j("GET", "/api/v1/notifications?unread=maybe", { token: customer })).status === 400);

// 1c. Audit trail and identity-check reset: super admin only. The KYC webhook is public but refuses unsigned messages.
check("audit trail readable by admin", (await j("GET", "/api/v1/audit-logs?limit=1", { token: admin })).status === 200);
for (const [who, token] of [["manager", manager], ["employee", employee], ["customer", customer]]) {
  check(`${who} cannot read the audit trail`, (await j("GET", "/api/v1/audit-logs", { token })).status === 403);
  check(`${who} cannot reset an identity check`, (await j("POST", `/api/v1/kyc/${uuid}/reset`, { token, body: {} })).status === 403);
}
check("KYC webhook without a signature is refused (401)", (await j("POST", "/api/v1/webhooks/kyc", { body: { providerRef: "x", status: "VERIFIED" } })).status === 401);
check("KYC webhook with a wrong signature is refused (401)", (await j("POST", "/api/v1/webhooks/kyc", { body: { providerRef: "x", status: "VERIFIED" }, headers: { "x-kyc-signature": "ab".repeat(32) } })).status === 401);
check("audit trail never shows a password", !/password|passwordHash/i.test((await j("GET", "/api/v1/audit-logs?limit=100", { token: admin })).text));

// 1d. Telemetry: trackers post with a device key (no login); staff read the live fleet within their scope.
const reading = { vehicleId: uuid, recordedAt: new Date().toISOString(), latitude: 12.97, longitude: 77.6, speedKmh: 10, batteryPercent: 50, odometerKm: 1, ignition: true };
for (const [label, headers] of [["no key", {}], ["a wrong key", { "x-device-key": "wrong-key-wrong-key-1" }]]) {
  check(`telemetry ingest with ${label} is refused (401)`, (await j("POST", "/api/v1/telemetry", { body: { readings: [reading] }, headers })).status === 401);
}
check("telemetry ingest ignores a user token (401)", (await j("POST", "/api/v1/telemetry", { token: admin, body: { readings: [reading] } })).status === 401);
check("customers cannot read the live fleet", (await j("GET", "/api/v1/fleet/live", { token: customer })).status === 403);
check("anonymous cannot read the live fleet", (await j("GET", "/api/v1/fleet/live")).status === 401);
check("an employee reads the live fleet", (await j("GET", "/api/v1/fleet/live", { token: employee })).status === 200);
const liveAdmin = (await j("GET", "/api/v1/fleet/live", { token: admin })).data;
const liveEmployee = (await j("GET", "/api/v1/fleet/live", { token: employee })).data;
check("the live fleet shows an employee fewer scooters than the admin", liveEmployee.vehicles.length < liveAdmin.vehicles.length);
check("the live fleet never names a rider", !/phone|fullName|pin|customer/i.test(JSON.stringify(liveAdmin)));
check("customers cannot read a scooter's path", (await j("GET", `/api/v1/vehicles/${uuid}/telemetry`, { token: customer })).status === 403);

// 2. Role boundaries on key admin actions.
check("employee cannot create city", (await j("POST", "/api/v1/cities", { token: employee, body: { name: "x", state: "y" } })).status === 403);
check("manager cannot create city", (await j("POST", "/api/v1/cities", { token: manager, body: { name: "x", state: "y" } })).status === 403);
check("manager cannot create vehicle model", (await j("POST", "/api/v1/vehicle-models", { token: manager, body: { brand: "a", name: "b", rangeKm: 1, topSpeedKmh: 1 } })).status === 403);
const blrStation = (await j("GET", "/api/v1/manage/stations?limit=100", { token: admin })).data.items.find((s) => s.name === "Indiranagar");
check("manager cannot read the admin dashboard", (await j("GET", "/api/v1/dashboard/admin", { token: manager })).status === 403);
check("employee cannot read the admin dashboard", (await j("GET", "/api/v1/dashboard/admin", { token: employee })).status === 403);
check("employee cannot read a city dashboard", (await j("GET", `/api/v1/dashboard/city/${blrStation.cityId}`, { token: employee })).status === 403);
check("manager (Hyderabad) cannot read the Bengaluru city dashboard", (await j("GET", `/api/v1/dashboard/city/${blrStation.cityId}`, { token: manager })).status === 403);
check("manager (Hyderabad) cannot read a Bengaluru station dashboard", (await j("GET", `/api/v1/dashboard/station/${blrStation.id}`, { token: manager })).status === 403);
check("employee can read their own station dashboard", (await j("GET", `/api/v1/dashboard/station/${blrStation.id}`, { token: employee })).status === 200);
check("admin can read the admin dashboard", (await j("GET", "/api/v1/dashboard/admin", { token: admin })).status === 200);
check("a bad dashboard range is a clean 400", (await j("GET", "/api/v1/dashboard/admin?range=forever", { token: admin })).status === 400);
check("manager (Hyderabad) cannot create station in Bengaluru", (await j("POST", "/api/v1/stations", { token: manager, body: { cityId: blrStation.cityId, name: "Hack", address: "x", latitude: 1, longitude: 1, capacity: 1 } })).status === 403);

// 3. Malformed / hostile input must give clean 4xx, never 5xx or stack traces.
const hostile = [
  ["POST", "/api/v1/auth/login", { raw: "{not json", headers: { "Content-Type": "application/json" } }],
  ["POST", "/api/v1/auth/login", { body: { email: ["a"], password: { $ne: 1 } } }],
  ["POST", "/api/v1/auth/login", { body: { email: "a@b.co", password: "x".repeat(5000) } }],
  ["POST", "/api/v1/auth/register", { body: { email: "x'; DROP TABLE \"User\";--@b.co", password: "Passw0rd!!", fullName: "x" } }],
  ["POST", "/api/v1/auth/register", { body: { email: "a@b.co", password: "Passw0rd!!", fullName: "<script>alert(1)</script>".repeat(50) } }],
  ["GET", "/api/v1/cities/not-a-uuid/stations", {}],
  ["GET", "/api/v1/stations/'%20OR%201=1--", {}],
  ["GET", "/api/v1/manage/vehicles?status=' OR 1=1--", { token: admin }],
  ["GET", "/api/v1/manage/vehicles?limit=-5&page=abc", { token: admin }],
  ["GET", "/api/v1/manage/vehicles?limit=99999999999999999999", { token: admin }],
  ["POST", "/api/v1/vehicles", { token: admin, body: { modelId: uuid, stationId: uuid, code: "A".repeat(10000) } }],
  ["PATCH", "/api/v1/me", { token: admin, body: { fullName: "x".repeat(100000) } }],
  ["POST", "/api/v1/auth/refresh", { body: { refreshToken: "\u0000".repeat(50) } }],
];
for (const [m, p, o] of hostile) {
  const r = await j(m, p, o);
  const leaked = /at .*\.(ts|js):\d+|node_modules|PrismaClient|ECONN|password hash/i.test(r.text);
  check(`hostile ${m} ${p.slice(0, 55)} -> 4xx, no leak`, r.status >= 400 && r.status < 500 && !leaked, `status ${r.status}${leaked ? " LEAK" : ""}`);
}
// Oversized body (10 MB)
const big = await j("POST", "/api/v1/auth/login", { raw: JSON.stringify({ email: "a@b.co", password: "x".repeat(10_000_000) }), headers: { "Content-Type": "application/json" } });
check("10 MB body rejected (413/4xx)", big.status >= 400 && big.status < 500, `status ${big.status}`);

// 4. Headers / CORS / info disclosure.
const h = await j("GET", "/api/v1/health");
const hdr = (n) => h.headers.get(n);
check("x-powered-by hidden", !hdr("x-powered-by"), `x-powered-by: ${hdr("x-powered-by")}`);
check("x-content-type-options nosniff", hdr("x-content-type-options") === "nosniff", `got ${hdr("x-content-type-options")}`);
const cors = await j("GET", "/api/v1/cities", { headers: { Origin: "http://evil.example" } });
check("CORS does not allow other origins", cors.headers.get("access-control-allow-origin") !== "http://evil.example" && cors.headers.get("access-control-allow-origin") !== "*", `ACAO: ${cors.headers.get("access-control-allow-origin")}`);
const corsOk = await j("GET", "/api/v1/cities", { headers: { Origin: "http://localhost:3000" } });
check("CORS allows the web app origin", corsOk.headers.get("access-control-allow-origin") === "http://localhost:3000");
check("404 body is JSON with code", (await j("GET", "/api/v1/nope")).data?.code === "NOT_FOUND");
check("/me never exposes password hash or tokens", !/passwordHash|refreshToken/.test((await j("GET", "/api/v1/me", { token: customer })).text));
check("public vehicle list hides internal fields", !/registrationNumber|odometerKm/.test((await j("GET", `/api/v1/stations/${blrStation.id}/vehicles`)).text));

// 5. Token handling.
const tampered = customer.slice(0, -3) + (customer.endsWith("aaa") ? "bbb" : "aaa");
check("tampered JWT rejected", (await j("GET", "/api/v1/me", { token: tampered })).status === 401);
const noneAlg = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + Buffer.from(JSON.stringify({ sub: uuid, role: "SUPER_ADMIN", exp: 9999999999 })).toString("base64url") + ".";
check("alg=none JWT rejected", (await j("GET", "/api/v1/users", { token: noneAlg })).status === 401);
check("refresh token is not accepted as access token", (await j("GET", "/api/v1/me", { token: (await j("POST", "/api/v1/auth/login", { body: { email: ACCOUNTS.employee[0], password: ACCOUNTS.employee[1] } })).data.refreshToken })).status === 401);

// 6. Login brute-force behaviour (informational).
let throttled = false;
for (let i = 0; i < 25; i++) {
  const r = await j("POST", "/api/v1/auth/login", { body: { email: ACCOUNTS.employee[0], password: "wrong-" + i } });
  if (r.status === 429) { throttled = true; break; }
}
check("login is rate limited after repeated failures", throttled, throttled ? "" : "25 failed attempts all processed (no throttling)");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log("FAIL:", f.name, "—", f.detail);
