// What the virtual users do. Each scenario returns the pieces runScenario needs. Closed loop: a user finishes one thing, waits
// (`think`), then does the next, like a person would. Use think 0 to find the limit, a few hundred ms to model people.
import { randomUUID } from "node:crypto";
import { DEVICE_KEY } from "./env.mjs";
import { customerTokens, loadFixture, staffTokens } from "./fixtures.mjs";
import { pick, randomInt, sleep } from "./lib.mjs";

/** Public browsing: pick a city, its stations, a station's scooters, one scooter. */
function browse() {
  const f = loadFixture();
  return {
    vu: async (ctx) => {
      await ctx.req("GET /cities", "GET", "/cities");
      await ctx.req("GET /cities/:id/stations", "GET", `/cities/${f.cityId}/stations`);
      const st = pick(f.stationIds);
      await ctx.req("GET /stations/:id/vehicles", "GET", `/stations/${st}/vehicles`);
      await ctx.req("GET /vehicles/:id", "GET", `/vehicles/${pick(f.vehicleIds)}`);
    },
  };
}

/** The price quote: the busiest public write-free endpoint (it checks availability in the database). */
function quote() {
  const f = loadFixture();
  return {
    vu: async (ctx) => {
      await ctx.req("POST /bookings/quote", "POST", "/bookings/quote", { body: { vehicleId: pick(f.vehicleIds), hours: 1 + randomInt(4) }, expect: [409] });
    },
  };
}

/** A signed-in customer looking around: home, their bookings, the bell, their profile. */
function customerRead(opts) {
  return {
    setup: async () => ({ tokens: await customerTokens(opts.vus) }),
    vu: async (ctx) => {
      const token = ctx.state.tokens[ctx.id % ctx.state.tokens.length];
      await ctx.req("GET /dashboard/customer", "GET", "/dashboard/customer", { token });
      await ctx.req("GET /bookings?tab=active", "GET", "/bookings?tab=active", { token });
      await ctx.req("GET /bookings?tab=past", "GET", "/bookings?tab=past&limit=20", { token });
      await ctx.req("GET /notifications/unread-count", "GET", "/notifications/unread-count", { token });
      await ctx.req("GET /me", "GET", "/me", { token });
    },
  };
}

/** Staff screens: the desk queues, the settlements list, the live fleet, the dashboards. */
function staffRead() {
  const f = loadFixture();
  return {
    setup: async () => ({ ...(await staffTokens()) }),
    vu: async (ctx) => {
      const { employee, admin } = ctx.state;
      await ctx.req("GET /station/bookings", "GET", `/station/bookings?tab=pickups&stationId=${f.stationIds[0]}`, { token: employee });
      await ctx.req("GET /fleet/live", "GET", "/fleet/live", { token: employee });
      await ctx.req("GET /settlements", "GET", "/settlements", { token: employee });
      await ctx.req("GET /dashboard/station/:id", "GET", `/dashboard/station/${f.stationIds[0]}`, { token: employee });
      await ctx.req("GET /dashboard/admin", "GET", "/dashboard/admin", { token: admin });
    },
  };
}

/** Trackers reporting: batches of readings for random scooters, like a gateway would send. */
function telemetry() {
  const f = loadFixture();
  const BATCH = 50;
  let tick = 0;
  return {
    vu: async (ctx) => {
      // A unique time per reading so the repeat filter does not swallow them.
      const base = Date.now() - 5_000 - (tick += BATCH);
      const readings = Array.from({ length: BATCH }, (_, i) => ({
        vehicleId: pick(f.vehicleIds),
        recordedAt: new Date(base + i + ctx.id * 7919).toISOString(),
        latitude: 12.9 + Math.random() * 0.1,
        longitude: 77.5 + Math.random() * 0.1,
        speedKmh: Math.round(Math.random() * 30),
        batteryPercent: 20 + randomInt(80),
        odometerKm: 100 + Math.random() * 50,
        ignition: true,
      }));
      await ctx.req("POST /telemetry (50 readings)", "POST", "/telemetry", { body: { readings }, headers: { "x-device-key": DEVICE_KEY } });
    },
  };
}

/** Everyone grabbing the same few scooters: book, pay, then cancel (or let the hold go). The contention scenario. */
function booking(opts) {
  const f = loadFixture();
  return {
    setup: async () => ({ tokens: await customerTokens(opts.vus) }),
    vu: async (ctx) => {
      const token = ctx.state.tokens[ctx.id % ctx.state.tokens.length];
      const created = await ctx.req("POST /bookings", "POST", "/bookings", { token, body: { vehicleId: pick(f.vehicleIds), hours: 1 }, expect: [409] });
      if (created.status !== 201) return;
      const id = created.data.id;
      // 15% walk away from the payment page: the hold is cancelled so the scooter is not stuck for ten minutes.
      if (Math.random() > 0.15) {
        await ctx.req("POST /bookings/:id/pay", "POST", `/bookings/${id}/pay`, { token, body: {}, headers: { "Idempotency-Key": randomUUID() } });
        await ctx.req("GET /bookings/:id", "GET", `/bookings/${id}`, { token });
      }
      await ctx.req("POST /bookings/:id/cancel", "POST", `/bookings/${id}/cancel`, { token, body: {} });
    },
  };
}

/** The whole rental: book, pay, hand over at the desk, take back (with extra km), read the bill. Few users: the desk is one employee. */
function ride(opts) {
  const f = loadFixture();
  return {
    setup: async () => ({ tokens: await customerTokens(opts.vus), ...(await staffTokens()) }),
    vu: async (ctx) => {
      const token = ctx.state.tokens[ctx.id % ctx.state.tokens.length];
      const emp = ctx.state.employee;
      const created = await ctx.req("POST /bookings", "POST", "/bookings", { token, body: { vehicleId: pick(f.vehicleIds), hours: 1 }, expect: [409] });
      if (created.status !== 201) return;
      const id = created.data.id;
      const paid = await ctx.req("POST /bookings/:id/pay", "POST", `/bookings/${id}/pay`, { token, body: {}, headers: { "Idempotency-Key": randomUUID() } });
      if (paid.status !== 200) return;
      const seen = await ctx.req("GET /station/bookings/:id", "GET", `/station/bookings/${id}`, { token: emp });
      const odo = seen.data.vehicle.odometerKm;
      const out = await ctx.req("POST /station/bookings/:id/pickup", "POST", `/station/bookings/${id}/pickup`, {
        token: emp,
        body: { pin: paid.data.pin, idChecked: true, startOdometerKm: odo, startBatteryPercent: 90 },
      });
      if (out.status !== 200) return;
      await ctx.req("POST /station/bookings/:id/return", "POST", `/station/bookings/${id}/return`, {
        token: emp,
        body: { returnStationId: pick(f.stationIds), endOdometerKm: odo + 5 + randomInt(30), endBatteryPercent: 60 },
      });
      await ctx.req("GET /bookings/:id/settlement", "GET", `/bookings/${id}/settlement`, { token });
    },
  };
}

/**
 * Duplicates and races: every step is sent several times at once (double taps, retries, two staff at one desk). Each must end with
 * exactly one winner and no server error, and `verify` must still pass afterwards. Run it against several instances.
 */
function chaos(opts) {
  const f = loadFixture();
  const all = (n, make) => Promise.all(Array.from({ length: n }, (_, i) => make(i)));
  return {
    setup: async () => ({ tokens: await customerTokens(opts.vus), ...(await staffTokens()) }),
    vu: async (ctx) => {
      const token = ctx.state.tokens[ctx.id % ctx.state.tokens.length];
      const emp = ctx.state.employee;
      const created = await ctx.req("POST /bookings", "POST", "/bookings", { token, body: { vehicleId: pick(f.vehicleIds), hours: 1 }, expect: [409] });
      if (created.status !== 201) return;
      const id = created.data.id;
      const sameKey = randomUUID();
      // Four payments at once: two with the same key (a retried tap), two with their own keys (two taps, two keys).
      const pays = await all(4, (i) =>
        ctx.req("POST /bookings/:id/pay (x4 at once)", "POST", `/bookings/${id}/pay`, { token, body: {}, headers: { "Idempotency-Key": i < 2 ? sameKey : randomUUID() }, expect: [409, 402] }),
      );
      const paid = pays.find((r) => r.status === 200 && r.data?.pin);
      if (!paid) return;
      const odo = (await ctx.req("GET /station/bookings/:id", "GET", `/station/bookings/${id}`, { token: emp })).data.vehicle.odometerKm;
      // Three desk clerks hand it over at the same moment.
      await all(3, () =>
        ctx.req("POST /pickup (x3 at once)", "POST", `/station/bookings/${id}/pickup`, { token: emp, body: { pin: paid.data.pin, idChecked: true, startOdometerKm: odo, startBatteryPercent: 90 }, expect: [409] }),
      );
      // The customer taps cancel three times while the scooter is out: all refused.
      await all(3, () => ctx.req("POST /cancel while out (x3)", "POST", `/bookings/${id}/cancel`, { token, body: {}, expect: [409] }));
      // Three take-backs at once.
      await all(3, () =>
        ctx.req("POST /return (x3 at once)", "POST", `/station/bookings/${id}/return`, { token: emp, body: { returnStationId: pick(f.stationIds), endOdometerKm: odo + 8, endBatteryPercent: 55 }, expect: [409] }),
      );
      // Two people pay the bill, if there is one (there is not here), and the customer reads it.
      await ctx.req("GET /bookings/:id/settlement", "GET", `/bookings/${id}/settlement`, { token });
    },
  };
}

/**
 * Abuse next to honest use. The first five virtual users are one abusive address hammering the price quote and guessing staff
 * passwords; everyone else is an ordinary visitor on their own address, browsing and asking for quotes now and then. Start the server with
 * RATE_LIMIT_ENABLED=true. Expected: the abuser gets 429s (never 5xx, never a slowdown for others); ordinary visitors get none.
 */
const ABUSERS = 5;
function abuse() {
  const f = loadFixture();
  return {
    ipFor: (id) => (id < ABUSERS ? "198.51.100.7" : `198.51.100.${10 + (id % 200)}`),
    vu: async (ctx) => {
      if (ctx.id < ABUSERS) {
        const r = Math.random();
        if (r < 0.7) await ctx.req("abuser: quote", "POST", "/bookings/quote", { body: { vehicleId: pick(f.vehicleIds), hours: 1 }, expect: [409] });
        else await ctx.req("abuser: guess a password", "POST", "/auth/login", { body: { email: `nobody${randomInt(1e6)}@rove.test`, password: "guess-guess-1" }, expect: [401] });
        return;
      }
      // A person reads the screen before the next tap: about one request a second, not eight.
      await sleep(600 + randomInt(800));
      await ctx.req("visitor: cities", "GET", "/cities");
      await ctx.req("visitor: scooters", "GET", `/stations/${pick(f.stationIds)}/vehicles`);
      if (Math.random() < 0.2) await ctx.req("visitor: quote", "POST", "/bookings/quote", { body: { vehicleId: pick(f.vehicleIds), hours: 2 }, expect: [409] });
    },
  };
}

/**
 * The website itself (server-rendered pages, each of which calls the API from the web server): anonymous visitors on the public pages
 * and signed-in customers on theirs. Needs the production website running against the load backend (see docs/TESTING.md, "Load test").
 */
const WEB = process.env.LOAD_WEB ?? "http://localhost:3040";
function web(opts) {
  const f = loadFixture();
  return {
    setup: async () => ({ tokens: await customerTokens(opts.vus) }),
    vu: async (ctx) => {
      const get = (label, path, token) => ctx.req(label, "GET", path, { base: WEB, headers: token ? { Cookie: `rove_at=${token}` } : {} });
      const r = Math.random();
      if (r < 0.7) {
        // Anonymous: home, find a station, look at a scooter.
        await get("page /", "/");
        await get("page /stations", "/stations");
        await get("page /stations/:id", `/stations/${pick(f.stationIds)}`);
        await get("page /book/:id", `/book/${pick(f.vehicleIds)}`);
      } else {
        const token = ctx.state.tokens[ctx.id % ctx.state.tokens.length];
        await get("page / (signed in)", "/", token);
        await get("page /bookings", "/bookings", token);
        await get("page /notifications", "/notifications", token);
      }
    },
  };
}

/** A believable blend: mostly browsing, some signed-in reading, a few bookings, a little staff and tracker traffic. */
function mixed(opts) {
  const parts = [
    [60, browse(opts)],
    [20, customerRead(opts)],
    [10, booking(opts)],
    [5, staffRead(opts)],
    [5, telemetry(opts)],
  ];
  const total = parts.reduce((n, [w]) => n + w, 0);
  return {
    setup: async (stats) => {
      const states = [];
      for (const [, p] of parts) states.push(p.setup ? await p.setup(stats) : {});
      return { states };
    },
    vu: async (ctx) => {
      let roll = randomInt(total);
      for (const [i, [w, p]] of parts.entries()) {
        if (roll < w) return p.vu({ ...ctx, state: ctx.state.states[i] });
        roll -= w;
      }
    },
  };
}

export const SCENARIOS = { browse, quote, "customer-read": customerRead, "staff-read": staffRead, telemetry, booking, ride, chaos, abuse, web, mixed };
