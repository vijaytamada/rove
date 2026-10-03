import { ACCOUNTS, loginPhone } from "./env.mjs";
// Page-by-role matrix against the running website (http://localhost:3000) and API (http://localhost:3001).
import { execSync } from "node:child_process";
const WEB = "http://localhost:3000", API = "http://localhost:3001/api/v1";
execSync(`docker exec rove-redis sh -c "redis-cli --scan --pattern 'login:fail:*' | xargs -r redis-cli del"`, { stdio: "ignore" });

const login = async (email, password) => {
  const r = await (await fetch(API + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  if (!r.accessToken) throw new Error("login failed for " + email + ": " + JSON.stringify(r));
  return r.accessToken;
};
const tokens = {
  anon: null,
  customer: await loginPhone(API, ACCOUNTS.customer.phone),
  employee: await login("employee.indiranagar@rove.local", ACCOUNTS.manager[1]),
  manager: await login("manager.hyd@rove.local", ACCOUNTS.manager[1]),
  admin: await login("admin@rove.local", ACCOUNTS.admin[1]),
};
const api = async (path, token) => (await (await fetch(API + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).json());
const blr = (await api("/cities")).find((c) => c.name === "Bengaluru");
const hyd = (await api("/cities")).find((c) => c.name === "Hyderabad");
const stationBlr = (await api(`/cities/${blr.id}/stations`))[0];
const stationHyd = (await api(`/cities/${hyd.id}/stations`))[0];
const vehBlr = (await api("/manage/vehicles?limit=100", tokens.admin)).items.find((v) => v.station?.cityId === blr.id);
const vehHyd = (await api("/manage/vehicles?limit=100", tokens.admin)).items.find((v) => v.station?.cityId === hyd.id);
const empHyd = (await api("/users?role=STATION_EMPLOYEE", tokens.admin)).items.find((u) => u.email.startsWith("employee.hitech"));
const empBlr = (await api("/users?role=STATION_EMPLOYEE", tokens.admin)).items.find((u) => u.email.startsWith("employee.indira"));

// expectation: "ok" = 200, "login" = redirect to /login, "home:<path>" = redirect to path, "404"
const routes = [
  ["/", { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  ["/stations", { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  [`/stations/${stationBlr.id}`, { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  ["/stations/not-a-uuid", { anon: "404", customer: "404", employee: "404", manager: "404", admin: "404" }],
  ["/stations/00000000-0000-4000-8000-000000000000", { anon: "404", customer: "404", employee: "404", manager: "404", admin: "404" }],
  ["/login", { anon: "ok", customer: "to:/", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/register", { anon: "ok", customer: "to:/", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/profile", { anon: "login", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  ["/staff", { anon: "login", customer: "to:/", employee: "ok", manager: "ok", admin: "ok" }],
  ["/admin", { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin/cities", { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin/stations", { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/stations/${stationHyd.id}`, { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/stations/${stationBlr.id}`, { anon: "login", customer: "to:/", employee: "to:/staff", manager: "404", admin: "ok" }],
  ["/admin/fleet", { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/fleet/${vehHyd.id}`, { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/fleet/${vehBlr.id}`, { anon: "login", customer: "to:/", employee: "to:/staff", manager: "404", admin: "ok" }],
  ["/admin/models", { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin/staff", { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/staff/${empHyd.id}`, { anon: "login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/staff/${empBlr.id}`, { anon: "login", customer: "to:/", employee: "to:/staff", manager: "404", admin: "ok" }],
  ["/nope", { anon: "404", customer: "404", employee: "404", manager: "404", admin: "404" }],
  ["/manifest.webmanifest", { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
];

const rows = [];
let failures = 0;
const expectedHome = (kind) => kind;
for (const [path, expect] of routes) {
  for (const [role, token] of Object.entries(tokens)) {
    const res = await fetch(WEB + path, { redirect: "manual", headers: token ? { Cookie: `rove_at=${token}` } : {} });
    const loc = res.headers.get("location") ? new URL(res.headers.get("location"), WEB) : null;
    let actual = res.status === 200 ? "ok" : res.status === 404 ? "404" : loc ? (loc.pathname === "/login" ? "login" : `to:${loc.pathname}`) : `status ${res.status}`;
    const want = expect[role];
    const body = res.status === 200 ? await res.text() : "";
    const crashed = /Application error|Internal Server Error|unhandled|Unhandled/.test(body) || res.status >= 500;
    const ok = actual === want && !crashed;
    if (!ok) { failures++; rows.push(`FAIL ${role.padEnd(8)} ${path.slice(0, 60)}  expected ${want}, got ${actual}${crashed ? " (CRASH)" : ""}`); }
  }
}
console.log(`${routes.length * 5 - failures}/${routes.length * 5} route/role combinations as expected`);
rows.forEach((r) => console.log(r));

// Content spot-checks (admin & scoping).
const text = async (path, token) => (await (await fetch(WEB + path, { headers: { Cookie: `rove_at=${token}` } })).text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const checks = [];
const t1 = await text("/admin/fleet", tokens.manager);
checks.push(["manager fleet shows only Hyderabad scooters", /HYD-001/.test(t1) && !/BLR-001/.test(t1)]);
const t2 = await text("/admin/stations", tokens.manager);
checks.push(["manager stations shows only Hyderabad", /HITEC City/.test(t2) && !/Indiranagar/.test(t2)]);
const t3 = await text("/admin/cities", tokens.manager);
checks.push(["manager cities has no 'Add a city' form", !/Add a city/.test(t3) && /Hyderabad/.test(t3) && !/Bengaluru/.test(t3)]);
const t4 = await text("/admin/models", tokens.manager);
checks.push(["manager models is read-only", !/Add a model/.test(t4)]);
const t5 = await text("/admin/staff", tokens.manager);
checks.push(["manager staff lists only own employees and no role picker", /employee\.hitech-city@rove\.local/.test(t5) && !/employee\.indiranagar/.test(t5) && !/Super admin/.test(t5)]);
const t6 = await text("/admin/staff", tokens.admin);
checks.push(["admin staff excludes customers", !/customer@rove\.local/.test(t6) && /admin@rove\.local/.test(t6) && /manager\.blr@rove\.local/.test(t6)]);
const t7 = await text("/staff", tokens.employee);
checks.push(["employee console shows only own station", /Indiranagar/.test(t7) && !/Koramangala/.test(t7) && !/HITEC/.test(t7)]);
const t8 = await text("/", tokens.customer);
checks.push(["customer home greets by name, no console button", /Hi, Demo/.test(t8) && !/Open your console/.test(t8)]);
const t9 = await text("/stations", tokens.anon ?? "x");
checks.push(["public stations lists Bengaluru stations", /Indiranagar/.test(t9) && /Koramangala/.test(t9)]);
const t10 = await text(`/stations/${stationBlr.id}`, tokens.customer);
checks.push(["station page lists scooters, no staff-only data", /BLR-001/.test(t10) && !/Registration/.test(t10) && !/Odometer/.test(t10)]);
const t11 = await text("/admin", tokens.admin);
checks.push(["admin overview counts", /Cities\s*2/.test(t11) && /Stations\s*5/.test(t11) && /Scooters\s*12/.test(t11)]);
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; }
process.exit(failures ? 1 : 0);
