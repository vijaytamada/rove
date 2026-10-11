import { describeRequest, pickSafeFields, routeWithoutPrefix } from './audit-describe.js';

describe('describeRequest', () => {
  it('gives the desk and settlement actions readable codes', () => {
    expect(describeRequest('POST', '/api/v1/station/bookings/:id/pickup')).toMatchObject({ action: 'BOOKING_PICKUP', entityType: 'booking' });
    expect(describeRequest('POST', '/api/v1/station/bookings/:id/return')?.action).toBe('BOOKING_RETURN');
    expect(describeRequest('POST', '/api/v1/station/bookings/:id/no-show')?.action).toBe('BOOKING_NO_SHOW');
    expect(describeRequest('POST', '/api/v1/settlements/:id/collect')).toMatchObject({ action: 'SETTLEMENT_COLLECT', entityType: 'settlement' });
    expect(describeRequest('POST', '/api/v1/settlements/:id/retry-refund')?.action).toBe('SETTLEMENT_RETRY_REFUND');
  });

  it('knows which calls create something, so the id comes from the response', () => {
    expect(describeRequest('POST', '/api/v1/users')).toMatchObject({ action: 'STAFF_CREATE', entityFromResponse: true });
    expect(describeRequest('PATCH', '/api/v1/users/:id')).toMatchObject({ action: 'STAFF_UPDATE', entityFromResponse: false });
  });

  it('records a route it has never heard of, so new endpoints are audited by default', () => {
    expect(describeRequest('POST', '/api/v1/fleet/recall')).toMatchObject({ action: 'POST /fleet/recall', entityType: 'fleet', entityFromResponse: true });
    expect(describeRequest('DELETE', '/api/v1/things/:id')).toMatchObject({ action: 'DELETE /things/:id', entityType: 'things', entityFromResponse: false });
  });

  it('never audits reads', () => {
    expect(describeRequest('GET', '/api/v1/settlements')).toBeNull();
    expect(describeRequest('HEAD', '/api/v1/settlements')).toBeNull();
    expect(describeRequest('OPTIONS', '/api/v1/settlements')).toBeNull();
  });

  it('skips sign-in, a person editing themselves, the inbox, webhooks', () => {
    for (const [m, r] of [
      ['POST', '/api/v1/auth/login'],
      ['POST', '/api/v1/auth/refresh'],
      ['PATCH', '/api/v1/me'],
      ['POST', '/api/v1/notifications/read-all'],
      ['POST', '/api/v1/notifications/:id/read'],
      ['POST', '/api/v1/webhooks/kyc'],
    ]) {
      expect(describeRequest(m, r)).toBeNull();
    }
  });

  it('does not mistake a route that merely starts with the same letters', () => {
    expect(describeRequest('POST', '/api/v1/members')).not.toBeNull(); // not "/me"
  });
});

describe('routeWithoutPrefix', () => {
  it('strips the API prefix only', () => {
    expect(routeWithoutPrefix('/api/v1/users/:id')).toBe('/users/:id');
    expect(routeWithoutPrefix('/health')).toBe('/health');
    expect(routeWithoutPrefix('/api/v1')).toBe('/');
  });
});

describe('pickSafeFields', () => {
  it('keeps only the allowed fields, and only plain values', () => {
    const body = { hourlyRateAmount: 5000, isActive: true, note: 'x', password: 'secret', depositAmount: { evil: 1 } };
    expect(pickSafeFields(body, ['hourlyRateAmount', 'isActive', 'depositAmount'])).toEqual({ hourlyRateAmount: 5000, isActive: true });
  });

  it('drops long text and returns null when nothing is allowed or present', () => {
    expect(pickSafeFields({ status: 'x'.repeat(100) }, ['status'])).toBeNull();
    expect(pickSafeFields({ status: 'DISABLED' }, [])).toBeNull();
    expect(pickSafeFields(undefined, ['status'])).toBeNull();
    expect(pickSafeFields({ other: 1 }, ['status'])).toBeNull();
  });
});
