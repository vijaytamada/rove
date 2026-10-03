import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface StaffScope {
  /** true for SUPER_ADMIN: no restriction. */
  unrestricted: boolean;
  cityIds: string[];
  stationIds: string[];
}

/**
 * Resource-level authorization (city/station scope). Scope is read from the database on each
 * check so reassignments apply immediately; it is not trusted from the JWT.
 * Role-level checks live in RolesGuard; services call these for the specific city/station.
 */
@Injectable()
export class ScopeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getScope(user: AuthUser): Promise<StaffScope> {
    if (user.role === 'SUPER_ADMIN') return { unrestricted: true, cityIds: [], stationIds: [] };
    if (user.role === 'CUSTOMER') return { unrestricted: false, cityIds: [], stationIds: [] };

    const rows = await this.prisma.staffAssignment.findMany({ where: { userId: user.id } });
    return {
      unrestricted: false,
      cityIds: rows.flatMap((r) => (r.cityId ? [r.cityId] : [])),
      stationIds: rows.flatMap((r) => (r.stationId ? [r.stationId] : [])),
    };
  }

  /** City managers may act on their cities; super admins on any. */
  async assertCityAccess(user: AuthUser, cityId: string): Promise<void> {
    const scope = await this.getScope(user);
    if (scope.unrestricted) return;
    if (user.role === 'CITY_MANAGER' && scope.cityIds.includes(cityId)) return;
    throw this.denied();
  }

  /**
   * Station access needs the station's city for managers (a manager covers every station in
   * their cities). Phase 3 resolves `cityId` from the Station table before calling this.
   */
  async assertStationAccess(user: AuthUser, target: { stationId: string; cityId: string }): Promise<void> {
    const scope = await this.getScope(user);
    if (scope.unrestricted) return;
    if (user.role === 'CITY_MANAGER' && scope.cityIds.includes(target.cityId)) return;
    if (user.role === 'STATION_EMPLOYEE' && scope.stationIds.includes(target.stationId)) return;
    throw this.denied();
  }

  private denied() {
    return new AppException(403, 'FORBIDDEN_SCOPE', "You don't have access to this city or station.");
  }
}
