import { vi } from 'vitest';
import { HealthService } from '../src/modules/health/health.service.js';
import { createTestApp, type TestApp } from './helpers.js';

// Requires Postgres + Redis from `docker compose up -d` (see docs/DEV_SETUP.md).
describe('Health (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());
  afterEach(() => vi.restoreAllMocks());

  it('GET /api/v1/health is public and reports database and redis up', async () => {
    const res = await t.http().get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('GET /health/live says the process is running, without touching the database', async () => {
    const check = vi.spyOn(t.app.get(HealthService), 'check');
    const res = await t.http().get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(check).not.toHaveBeenCalled();
  });

  it('GET /health/ready is 200 when the database and Redis are up', async () => {
    const res = await t.http().get('/api/v1/health/ready').expect(200);
    expect(res.body.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('GET /health/ready is 503 while a dependency is down, but /health/live still answers', async () => {
    vi.spyOn(t.app.get(HealthService), 'check').mockResolvedValue({
      status: 'degraded',
      checks: { database: 'down', redis: 'up' },
      uptimeSeconds: 1,
      timestamp: new Date().toISOString(),
    });
    const res = await t.http().get('/api/v1/health/ready').expect(503);
    expect(res.body).toMatchObject({ code: 'NOT_READY', details: { database: 'down', redis: 'up' } });
    await t.http().get('/api/v1/health/live').expect(200);
  });
});
