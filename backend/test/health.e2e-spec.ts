import { createTestApp, type TestApp } from './helpers.js';

// Requires Postgres + Redis from `docker compose up -d` (see docs/DEV_SETUP.md).
describe('Health (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  it('GET /api/v1/health is public and reports database and redis up', async () => {
    const res = await t.http().get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toEqual({ database: 'up', redis: 'up' });
  });
});
