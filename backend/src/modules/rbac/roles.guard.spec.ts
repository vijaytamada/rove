import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../../common/auth.decorators.js';
import { RolesGuard } from './roles.guard.js';

class AdminOnly {
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  handler(this: void) {}

  open(this: void) {}
}

function ctx(handler: () => void, role?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AdminOnly,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { id: 'u', role } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const target = new AdminOnly();

  it('allows listed roles', () => {
    expect(guard.canActivate(ctx(target.handler, 'SUPER_ADMIN'))).toBe(true);
    expect(guard.canActivate(ctx(target.handler, 'CITY_MANAGER'))).toBe(true);
  });

  it('rejects other roles', () => {
    expect(() => guard.canActivate(ctx(target.handler, 'CUSTOMER'))).toThrow();
    expect(() => guard.canActivate(ctx(target.handler, 'STATION_EMPLOYEE'))).toThrow();
  });

  it('only requires authentication when no roles are declared', () => {
    expect(guard.canActivate(ctx(target.open, 'CUSTOMER'))).toBe(true);
  });
});
