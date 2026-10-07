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
const publicPaths = new Set(["/api/v1/health", "/api/v1/auth/phone/request", "/api/v1/auth/phone/verify", "/api/v1/auth/phone/signup", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/cities", "/api/v1/cities/{cityId}/stations", "/api/v1/stations/{id}", "/api/v1/stations/{stationId}/vehicles", "/api/v1/vehicles/{id}", "/api/v1/bookings/quote"]);
// Customer-only routes: a customer is allowed in (checked below that staff are not).
const customerOnly = new Set(["/api/v1/kyc/status", "/api/v1/kyc/start", "/api/v1/bookings", "/api/v1/bookings/{id}", "/api/v1/bookings/{id}/pay", "/api/v1/bookings/{id}/cancel"]);
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
      const allowedForCustomer = ["/api/v1/me", "/api/v1/auth/otp/send", "/api/v1/auth/otp/verify", "/api/v1/auth/phone/change", "/api/v1/auth/phone/change/verify"].includes(path) || customerOnly.has(path);
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

// 2. Role boundaries on key admin actions.
check("employee cannot create city", (await j("POST", "/api/v1/cities", { token: employee, body: { name: "x", state: "y" } })).status === 403);
check("manager cannot create city", (await j("POST", "/api/v1/cities", { token: manager, body: { name: "x", state: "y" } })).status === 403);
check("manager cannot create vehicle model", (await j("POST", "/api/v1/vehicle-models", { token: manager, body: { brand: "a", name: "b", rangeKm: 1, topSpeedKmh: 1 } })).status === 403);
const blrStation = (await j("GET", "/api/v1/manage/stations?limit=100", { token: admin })).data.items.find((s) => s.name === "Indiranagar");
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
