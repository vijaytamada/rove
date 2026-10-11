import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { JsonLogger, requestIdFrom, requestLogger, type RequestLogLine } from './request-logger.js';

describe('requestIdFrom', () => {
  it('keeps a short safe id from the caller', () => {
    expect(requestIdFrom('abc-123_XYZ.456')).toBe('abc-123_XYZ.456');
    expect(requestIdFrom(['first-id-0001', 'second'])).toBe('first-id-0001');
  });

  it('replaces a missing, short, long or unsafe id with a new one', () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(requestIdFrom(undefined)).toMatch(uuid);
    expect(requestIdFrom('short')).toMatch(uuid);
    expect(requestIdFrom('x'.repeat(65))).toMatch(uuid);
    expect(requestIdFrom('has spaces in it!')).toMatch(uuid);
    expect(requestIdFrom('line\nbreak-injection')).toMatch(uuid);
    expect(requestIdFrom('<script>alert(1)</script>')).toMatch(uuid);
  });
});

function run(opts: { headers?: Record<string, string>; route?: string; status?: number; user?: { id: string }; path?: string }) {
  const lines: RequestLogLine[] = [];
  const headers = new Map<string, string>();
  const res = Object.assign(new EventEmitter(), {
    statusCode: opts.status ?? 200,
    setHeader: (k: string, v: string) => headers.set(k.toLowerCase(), v),
  }) as unknown as Response;
  const req = {
    headers: opts.headers ?? {},
    method: 'POST',
    path: opts.path ?? '/api/v1/bookings/123/pay',
    route: opts.route ? { path: opts.route } : undefined,
    user: opts.user,
    url: '/api/v1/bookings/123/pay?secret=1',
  } as unknown as Request;
  let nexted = false;
  requestLogger((l) => lines.push(l))(req, res, () => (nexted = true));
  res.emit('finish');
  return { lines, headers, req, nexted };
}

describe('requestLogger', () => {
  it('gives the request an id, echoes it, and logs one line with the route pattern, not the real URL', () => {
    const { lines, headers, nexted } = run({ route: '/api/v1/bookings/:id/pay', status: 200, user: { id: 'u1' } });
    expect(nexted).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ msg: 'request', method: 'POST', route: '/api/v1/bookings/:id/pay', status: 200, userId: 'u1' });
    expect(headers.get('x-request-id')).toBe(lines[0].requestId);
    expect(JSON.stringify(lines[0])).not.toContain('secret');
    expect(JSON.stringify(lines[0])).not.toContain('123');
  });

  it('uses the caller\'s request id when it is safe', () => {
    const { lines, headers } = run({ headers: { 'x-request-id': 'trace-abc-12345' }, route: '/x' });
    expect(lines[0].requestId).toBe('trace-abc-12345');
    expect(headers.get('x-request-id')).toBe('trace-abc-12345');
  });

  it('says "unmatched" for a URL that matched no route, and leaves out the user when signed out', () => {
    const { lines } = run({ status: 404 });
    expect(lines[0].route).toBe('unmatched');
    expect(lines[0]).not.toHaveProperty('userId');
    expect(lines[0].status).toBe(404);
  });

  it('does not log health checks', () => {
    expect(run({ path: '/api/v1/health', route: '/api/v1/health' }).lines).toHaveLength(0);
  });
});

describe('JsonLogger', () => {
  it('writes one JSON object per line, errors to stderr', () => {
    const out: string[] = [];
    const err: string[] = [];
    const so = process.stdout.write.bind(process.stdout);
    const se = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((s: string) => (out.push(String(s)), true)) as typeof process.stdout.write;
    process.stderr.write = ((s: string) => (err.push(String(s)), true)) as typeof process.stderr.write;
    try {
      const logger = new JsonLogger();
      logger.log('hello', 'Ctx');
      logger.warn('careful');
      logger.error('boom', 'stack trace here', 'Ctx2');
      logger.error(new Error('as error'));
    } finally {
      process.stdout.write = so;
      process.stderr.write = se;
    }
    expect(out).toHaveLength(2);
    expect(JSON.parse(out[0])).toMatchObject({ level: 'info', message: 'hello', context: 'Ctx' });
    expect(JSON.parse(out[1])).toMatchObject({ level: 'warn', message: 'careful' });
    expect(out[0].endsWith('\n')).toBe(true);
    expect(JSON.parse(err[0])).toMatchObject({ level: 'error', message: 'boom', context: 'Ctx2', stack: 'stack trace here' });
    expect(JSON.parse(err[1])).toMatchObject({ level: 'error', message: 'as error' });
  });
});
