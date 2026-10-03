import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/app-exception.js';
import { ROLES_KEY, type AuthUser } from '../../common/auth.decorators.js';
import type { Role } from '../../generated/prisma/client.js';

/** Enforces @Roles(...). Routes without @Roles only require authentication. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) {
      throw new AppException(403, 'FORBIDDEN_ROLE', "You don't have access to this.");
    }
    return true;
  }
}
