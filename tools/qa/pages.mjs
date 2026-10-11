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
const plan = (await api("/manage/pricing-plans", tokens.admin)).items[0];
const empHyd = (await api("/users?role=STATION_EMPLOYEE", tokens.admin)).items.find((u) => u.email.startsWith("employee.hitech"));
const empBlr = (await api("/users?role=STATION_EMPLOYEE", tokens.admin)).items.find((u) => u.email.startsWith("employee.indira"));

// expectation: "ok" = 200, "login" = redirect to /login, "staff-login" = redirect to /login/staff, "home:<path>" = redirect to path, "404"
const routes = [
  ["/", { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  ["/stations", { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  [`/stations/${stationBlr.id}`, { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  ["/stations/not-a-uuid", { anon: "404", customer: "404", employee: "404", manager: "404", admin: "404" }],
  ["/stations/00000000-0000-4000-8000-000000000000", { anon: "404", customer: "404", employee: "404", manager: "404", admin: "404" }],
  ["/login", { anon: "ok", customer: "to:/", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/login/staff", { anon: "ok", customer: "to:/", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/register", { anon: "login", customer: "to:/", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/profile", { anon: "login", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  ["/staff", { anon: "staff-login", customer: "to:/", employee: "ok", manager: "ok", admin: "ok" }],
  ["/staff/settlements", { anon: "staff-login", customer: "to:/", employee: "ok", manager: "ok", admin: "ok" }],
  ["/staff/settlements?tab=refunds", { anon: "staff-login", customer: "to:/", employee: "ok", manager: "ok", admin: "ok" }],
  ["/staff/fleet", { anon: "staff-login", customer: "to:/", employee: "ok", manager: "ok", admin: "ok" }],
  ["/staff/bookings/00000000-0000-4000-8000-000000000000", { anon: "staff-login", customer: "to:/", employee: "404", manager: "404", admin: "404" }],
  ["/staff/bookings/not-a-uuid", { anon: "staff-login", customer: "to:/", employee: "404", manager: "404", admin: "404" }],
  ["/admin", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin?range=1d", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin?range=nope", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin/cities", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin/stations", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/stations/${stationHyd.id}`, { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/stations/${stationBlr.id}`, { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "404", admin: "ok" }],
  ["/admin/fleet", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/fleet/${vehHyd.id}`, { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/fleet/${vehBlr.id}`, { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "404", admin: "ok" }],
  ["/admin/models", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  ["/admin/staff", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/staff/${empHyd.id}`, { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/staff/${empBlr.id}`, { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "404", admin: "ok" }],
  ["/bookings", { anon: "login", customer: "ok", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/bookings/00000000-0000-4000-8000-000000000000", { anon: "login", customer: "404", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/bookings/00000000-0000-4000-8000-000000000000/pay", { anon: "login", customer: "404", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/bookings/00000000-0000-4000-8000-000000000000/settle", { anon: "login", customer: "404", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/bookings/not-a-uuid/settle", { anon: "login", customer: "404", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/notifications", { anon: "login", customer: "ok", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  ["/admin/audit", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "to:/admin", admin: "ok" }],
  ["/verify", { anon: "login", customer: "ok", employee: "to:/staff", manager: "to:/admin", admin: "to:/admin" }],
  [`/book/${vehBlr.id}`, { anon: "ok", customer: "ok", employee: "ok", manager: "ok", admin: "ok" }],
  ["/book/not-a-uuid", { anon: "404", customer: "404", employee: "404", manager: "404", admin: "404" }],
  ["/book/00000000-0000-4000-8000-000000000000", { anon: "404", customer: "404", employee: "404", manager: "404", admin: "404" }],
  ["/admin/pricing", { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "ok", admin: "ok" }],
  [`/admin/pricing/${plan.id}`, { anon: "staff-login", customer: "to:/", employee: "to:/staff", manager: "to:/admin", admin: "ok" }],
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
    let actual = res.status === 200 ? "ok" : res.status === 404 ? "404" : loc ? (loc.pathname === "/login" ? "login" : loc.pathname === "/login/staff" ? "staff-login" : `to:${loc.pathname}`) : `status ${res.status}`;
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
checks.push(["customer home greets by name, no console button", /Hi, \w+/.test(t8) && !/Open your console/.test(t8)]);
const t9 = await text("/stations", tokens.anon ?? "x");
checks.push(["public stations lists Bengaluru stations", /Indiranagar/.test(t9) && /Koramangala/.test(t9)]);
const t10 = await text(`/stations/${stationBlr.id}`, tokens.customer);
checks.push(["station page lists scooters, no staff-only data", /BLR-001/.test(t10) && !/Registration/.test(t10) && !/Odometer/.test(t10)]);
const t11 = await text("/admin", tokens.admin);
checks.push(["admin overview counts", /Cities\s*2/.test(t11) && /Stations\s*5/.test(t11) && /Scooters\s*12/.test(t11)]);
const t12 = await text(`/book/${vehBlr.id}`, tokens.customer);
checks.push(["booking page shows rates, deposit and no staff-only data", /Rates and rules/.test(t12) && /deposit/.test(t12) && !/Odometer/.test(t12)]);
const t13 = await text(`/book/${vehBlr.id}`, tokens.manager);
checks.push(["staff see a customers-only notice instead of the booking form", /customer accounts/.test(t13) && !/Start now/.test(t13)]);
const t14 = await text("/admin/pricing", tokens.manager);
checks.push(["manager pricing is read-only", /Pricing/.test(t14) && !/Add plan/.test(t14)]);
const t15 = await text("/admin/pricing", tokens.admin);
checks.push(["admin pricing can add plans", /Add plan/.test(t15) && /₹/.test(t15)]);
const t16 = await text("/stations", tokens.anon ?? "x");
checks.push(["with two cities, cities sit behind a selector button (not side by side)", /Bengaluru/.test(t16) && !/Hyderabad/.test(t16)]);
const t17 = await text("/staff", tokens.employee);
checks.push(["station desk has the three queues and the station heading", /Station desk/.test(t17) && /Pickups/.test(t17) && /On a ride/.test(t17) && /Done/.test(t17)]);
const t18 = await text("/staff/fleet", tokens.employee);
checks.push(["employee scooter list shows only own station", /BLR-001|Indiranagar/.test(t18) && !/HITEC/.test(t18) && !/Koramangala/.test(t18)]);
const t19 = await text("/staff/settlements", tokens.employee);
checks.push(["settlements page has its three lists", /Settlements/.test(t19) && /Owed/.test(t19) && /Refunds waiting/.test(t19) && /Paid/.test(t19)]);
const t20 = await text("/admin", tokens.admin);
checks.push(["admin dashboard shows the network with a row per city", /Right now/.test(t20) && /Utilization/.test(t20) && /Bengaluru/.test(t20) && /Hyderabad/.test(t20)]);
const t21 = await text("/admin", tokens.manager);
checks.push(["manager dashboard is about their city only", /Hyderabad: how the city is doing/.test(t21) && /HITEC City/.test(t21) && !/Bengaluru/.test(t21) && !/Indiranagar/.test(t21)]);
const t22 = await text(`/admin?city=${blr.id}`, tokens.manager);
checks.push(["a manager cannot open another city's dashboard through the URL", /Hyderabad: how the city is doing/.test(t22) && !/Bengaluru/.test(t22)]);
const t23 = await text("/staff", tokens.employee);
checks.push(["station desk shows the station's numbers", /Waiting for pickup/.test(t23) && /Owed by customers/.test(t23) && /Refunds not sent/.test(t23)]);
const t24 = await text("/admin?range=1d", tokens.admin);
checks.push(["the 24 hour window is labelled", /Activity, the last 24 hours/.test(t24) && /Money, the last 24 hours/.test(t24)]);
const t25 = await text("/notifications", tokens.customer);
checks.push(["customer notifications page renders (inbox or its empty note)", /Notifications/.test(t25) && (/Nothing yet/.test(t25) || /View booking|Mark as read|ago|Just now|Yesterday/.test(t25))]);
const html = async (path, token) => (await fetch(WEB + path, { headers: { Cookie: `rove_at=${token}` } })).text();
checks.push(["customer header has the bell", /aria-label="Notifications/.test(await html("/", tokens.customer))]);
checks.push(["staff header has no bell", !/aria-label="Notifications/.test(await html("/", tokens.employee))]);
const t28 = await text("/admin/audit", tokens.admin);
checks.push(["admin audit trail page lists who did what", /Audit trail/.test(t28) && (/Nothing recorded/.test(t28) || /Handed a scooter over|Took a scooter back|Identity|Added|Changed|System/.test(t28))]);
checks.push(["only admins see the audit link in the console", /Audit trail/.test(await text("/admin", tokens.admin)) && !/Audit trail/.test(await text("/admin", tokens.manager))]);
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; }
process.exit(failures ? 1 : 0);
