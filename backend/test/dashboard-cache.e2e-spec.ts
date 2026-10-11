// The dashboards keep their numbers for a few seconds. This file turns that on (the other e2e files run with it off so they see
// every change at once) and checks: stale-for-a-moment, fresh-after-the-time, one computation for a crowd, scope still enforced.
import { vi } from 'vitest';
import { createTestApp, type TestApp } from './helpers.js';

// Imports are read before ordinary code runs, and the app reads its settings when it is imported: set this first.
vi.hoisted(() => {
  process.env.DASHBOARD_CACHE_SECONDS = '2';
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Dashboard cache (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  const api = (path: string) => `/api/v1${path}`;

  async function setup() {
    const base = await t.makeBookable({ vehicles: 3 });
    const admin = await t.asRole('SUPER_ADMIN');
    const manager = await t.asRole('CITY_MANAGER', { cityIds: [base.cityId] });
    const other = await t.asRole('CITY_MANAGER', { cityIds: [(await t.makeCity()).id] });
    const customer = await t.verifiedCustomer();
    return { ...base, admin, manager, other, customer };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  async function paidBooking(s: Setup, vehicle: number, customer: { auth: { Authorization: string } }) {
    const created = await t.http().post(api('/bookings')).set(customer.auth).send({ vehicleId: s.vehicleIds[vehicle], hours: 1 }).expect(201);
    await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(customer.auth).send({}).expect(200);
  }
  const waiting = async (s: Setup) => (await t.http().get(api(`/dashboard/city/${s.cityId}`)).set(s.manager.auth).expect(200)).body.now.waitingPickups as number;

  it('shows a change after the time is up, not before', async () => {
    const s = await setup();
    expect(await waiting(s)).toBe(0);
    await paidBooking(s, 0, s.customer);
    expect(await waiting(s)).toBe(0); // still the remembered numbers
    await sleep(2200);
    expect(await waiting(s)).toBe(1);
  });

  it('a crowd asking at once shares one computation', async () => {
    const s = await setup();
    const responses = await Promise.all(Array.from({ length: 15 }, () => t.http().get(api(`/dashboard/city/${s.cityId}`)).set(s.manager.auth).expect(200)));
    // One computation means one window: every answer carries the very same time.
    expect(new Set(responses.map((r) => r.body.window.to)).size).toBe(1);
  });

  it('keeps each city apart, and the admin overview too', async () => {
    const s = await setup();
    await paidBooking(s, 0, s.customer);
    await sleep(2200);
    const mine = await t.http().get(api(`/dashboard/city/${s.cityId}`)).set(s.manager.auth).expect(200);
    expect(mine.body.now.waitingPickups).toBe(1);
    const adminView = await t.http().get(api(`/dashboard/city/${s.cityId}`)).set(s.admin.auth).expect(200);
    expect(adminView.body.now.waitingPickups).toBe(1);
    // Another city's manager is still refused: the cache sits behind the access check.
    await t.http().get(api(`/dashboard/city/${s.cityId}`)).set(s.other.auth).expect(403);
    const overview = await t.http().get(api('/dashboard/admin')).set(s.admin.auth).expect(200);
    expect(overview.body.cities.find((c: { id: string }) => c.id === s.cityId).now.waitingPickups).toBe(1);
  });

  it('different ranges do not share numbers', async () => {
    const s = await setup();
    await paidBooking(s, 0, s.customer);
    await sleep(2200);
    const day = await t.http().get(api(`/dashboard/city/${s.cityId}?range=1d`)).set(s.manager.auth).expect(200);
    const month = await t.http().get(api(`/dashboard/city/${s.cityId}?range=30d`)).set(s.manager.auth).expect(200);
    expect(day.body.window.hours).toBe(24);
    expect(month.body.window.hours).toBe(720);
  });
});
