import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { Prisma, Role, UserStatus, type StaffAssignment, type User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ScopeService, type StaffScope } from '../rbac/scope.service.js';
import type { AssignmentDto, CreateStaffDto, ListUsersQuery, UpdateMeDto, UpdateUserDto } from './dto/user.dto.js';
import { PasswordService } from './password.service.js';

export interface UserView {
  id: string;
  /** Null for customers who sign in with their phone only. */
  email: string | null;
  phone: string | null;
  fullName: string;
  role: Role;
  status: UserStatus;
  phoneVerified: boolean;
  createdAt: Date;
  scope?: Pick<StaffScope, 'cityIds' | 'stationIds'>;
}

export function toUserView(user: User, scope?: StaffScope): UserView {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    phoneVerified: user.phoneVerifiedAt !== null,
    createdAt: user.createdAt,
    ...(scope && { scope: { cityIds: scope.cityIds, stationIds: scope.stationIds } }),
  };
}

/** Which assignment kind (if any) a role may hold. */
export function validateAssignments(role: Role, items: AssignmentDto[]): AssignmentDto[] {
  const bad = (message: string) => new AppException(400, 'INVALID_ASSIGNMENT', message);

  if (items.some((i) => Boolean(i.cityId) === Boolean(i.stationId))) {
    throw bad('Each assignment needs exactly one of cityId or stationId.');
  }
  if (role === 'CITY_MANAGER' && items.some((i) => !i.cityId)) {
    throw bad('City managers can only be assigned to cities.');
  }
  if (role === 'STATION_EMPLOYEE' && items.some((i) => !i.stationId)) {
    throw bad('Station employees can only be assigned to stations.');
  }
  if ((role === 'SUPER_ADMIN' || role === 'CUSTOMER') && items.length > 0) {
    throw bad('This role cannot have city or station assignments.');
  }

  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.cityId ?? ''}|${i.stationId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type UserWithAssignments = User & { assignments: StaffAssignment[] };

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
  ) {}

  async getById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppException(404, 'USER_NOT_FOUND', 'User not found.');
    return user;
  }

  async getByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async getByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  /** Customer account created after the phone number was verified with a one-time code. */
  async createCustomer(input: { phone: string; fullName: string }): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: { phone: input.phone, fullName: input.fullName.trim(), role: 'CUSTOMER', phoneVerifiedAt: new Date() },
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async getView(id: string, includeScope = true): Promise<UserView> {
    const user = await this.getById(id);
    const scope = includeScope ? await this.scopes.getScope({ id: user.id, role: user.role }) : undefined;
    return toUserView(user, scope);
  }

  /** Creates a user. Callers are responsible for authorizing `assignments` (see createStaff). */
  async create(input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role: Role;
    assignments?: AssignmentDto[];
  }): Promise<User> {
    const email = input.email.toLowerCase();
    const assignments = validateAssignments(input.role, input.assignments ?? []);
    await this.assertUnique({ email, phone: input.phone });
    const passwordHash = await this.passwords.hash(input.password);

    try {
      return await this.prisma.user.create({
        data: {
          email,
          phone: input.phone ?? null,
          passwordHash,
          fullName: input.fullName.trim(),
          role: input.role,
          assignments: { create: assignments.map((a) => ({ cityId: a.cityId, stationId: a.stationId })) },
        },
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  /**
   * Super admins create any staff role. City managers create station employees only, assigned to
   * stations inside their own cities.
   */
  async createStaff(actor: AuthUser, dto: CreateStaffDto): Promise<User> {
    if (dto.role === 'CUSTOMER') {
      throw new AppException(400, 'INVALID_ROLE', 'Use registration to create customer accounts.');
    }
    if (actor.role === 'CITY_MANAGER' && dto.role !== 'STATION_EMPLOYEE') {
      throw new AppException(403, 'FORBIDDEN_ROLE', 'City managers can only create station employees.');
    }
    const assignments = validateAssignments(dto.role, dto.assignments ?? []);
    // Staff without a city/station can't do anything, so require one when the account is created.
    if (dto.role === 'STATION_EMPLOYEE' && assignments.length === 0) {
      throw new AppException(400, 'INVALID_ASSIGNMENT', 'Assign the employee to at least one station.');
    }
    if (dto.role === 'CITY_MANAGER' && assignments.length === 0) {
      throw new AppException(400, 'INVALID_ASSIGNMENT', 'Assign the city manager to at least one city.');
    }
    await this.assertAssignmentTargets(actor, assignments);
    return this.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
      assignments,
    });
  }

  async updateMe(id: string, dto: UpdateMeDto): Promise<User> {
    await this.getById(id);
    return this.prisma.user.update({
      where: { id },
      data: { ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }) },
    });
  }

  /** Throws PHONE_TAKEN when another account already uses `phone`. */
  async assertPhoneAvailable(phone: string, userId: string): Promise<void> {
    await this.assertUnique({ phone, excludeId: userId });
  }

  /** Saves a phone number that has just been confirmed with a one-time code. */
  async setVerifiedPhone(id: string, phone: string): Promise<void> {
    await this.assertUnique({ phone, excludeId: id });
    try {
      await this.prisma.user.update({ where: { id }, data: { phone, phoneVerifiedAt: new Date() } });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  /** Super admins see everyone; city managers see the station employees of their cities. */
  async list(actor: AuthUser, query: ListUsersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {};

    if (actor.role === 'CITY_MANAGER') {
      const scope = await this.scopes.getScope(actor);
      where.role = 'STATION_EMPLOYEE';
      where.assignments = { some: { station: { cityId: { in: scope.cityIds } } } };
      if (query.role && query.role !== 'STATION_EMPLOYEE') where.role = query.role; // yields no rows
    } else if (query.role) {
      where.role = query.role;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { assignments: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((u) =>
        toUserView(u, {
          unrestricted: false,
          cityIds: u.assignments.flatMap((a) => (a.cityId ? [a.cityId] : [])),
          stationIds: u.assignments.flatMap((a) => (a.stationId ? [a.stationId] : [])),
        }),
      ),
      total,
      page,
      limit,
    };
  }

  async getForActor(actor: AuthUser, id: string): Promise<UserView> {
    await this.assertCanManage(actor, await this.loadWithAssignments(id));
    return this.getView(id);
  }

  async adminUpdate(actor: AuthUser, id: string, dto: UpdateUserDto): Promise<User> {
    await this.assertCanManage(actor, await this.loadWithAssignments(id));
    if (dto.status === 'DISABLED' && id === actor.id) {
      throw new AppException(400, 'CANNOT_DISABLE_SELF', "You can't disable your own account.");
    }
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
      }),
      // Disabling a user signs them out everywhere.
      ...(dto.status === 'DISABLED'
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId: id, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
    return user;
  }

  async setAssignments(actor: AuthUser, id: string, items: AssignmentDto[]): Promise<UserView> {
    const user = await this.loadWithAssignments(id);
    await this.assertCanManage(actor, user);
    const assignments = validateAssignments(user.role, items);
    if (actor.role === 'CITY_MANAGER' && assignments.length === 0) {
      throw new AppException(400, 'INVALID_ASSIGNMENT', 'Assign the employee to at least one station.');
    }
    await this.assertAssignmentTargets(actor, assignments);
    await this.prisma.$transaction([
      this.prisma.staffAssignment.deleteMany({ where: { userId: id } }),
      this.prisma.staffAssignment.createMany({
        data: assignments.map((a) => ({ userId: id, cityId: a.cityId, stationId: a.stationId })),
      }),
    ]);
    return this.getView(id);
  }

  async markPhoneVerified(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { phoneVerifiedAt: new Date() } });
  }

  private async loadWithAssignments(id: string): Promise<UserWithAssignments> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { assignments: true } });
    if (!user) throw new AppException(404, 'USER_NOT_FOUND', 'User not found.');
    return user;
  }

  /**
   * Super admins manage everyone. City managers manage station employees only, and only when every
   * station the employee is assigned to is inside the manager's cities.
   */
  private async assertCanManage(actor: AuthUser, target: UserWithAssignments): Promise<void> {
    if (actor.role === 'SUPER_ADMIN') return;
    const denied = new AppException(403, 'FORBIDDEN_SCOPE', "You can't manage this user.");
    if (actor.role !== 'CITY_MANAGER' || target.role !== 'STATION_EMPLOYEE') throw denied;

    const stationIds = target.assignments.flatMap((a) => (a.stationId ? [a.stationId] : []));
    if (stationIds.length === 0) throw denied;
    const [scope, stations] = await Promise.all([
      this.scopes.getScope(actor),
      this.prisma.station.findMany({ where: { id: { in: stationIds } }, select: { cityId: true } }),
    ]);
    if (!stations.every((s) => scope.cityIds.includes(s.cityId))) throw denied;
  }

  /** Cities/stations must exist, and managers may only assign stations inside their own cities. */
  private async assertAssignmentTargets(actor: AuthUser, items: AssignmentDto[]): Promise<void> {
    const cityIds = items.flatMap((i) => (i.cityId ? [i.cityId] : []));
    const stationIds = items.flatMap((i) => (i.stationId ? [i.stationId] : []));

    if (cityIds.length) {
      const found = await this.prisma.city.count({ where: { id: { in: cityIds } } });
      if (found !== cityIds.length) throw new AppException(400, 'UNKNOWN_CITY', 'One of the cities does not exist.');
    }
    if (stationIds.length) {
      const stations = await this.prisma.station.findMany({
        where: { id: { in: stationIds } },
        select: { id: true, cityId: true },
      });
      if (stations.length !== stationIds.length) {
        throw new AppException(400, 'UNKNOWN_STATION', 'One of the stations does not exist.');
      }
      if (actor.role === 'CITY_MANAGER') {
        const scope = await this.scopes.getScope(actor);
        if (!stations.every((s) => scope.cityIds.includes(s.cityId))) {
          throw new AppException(403, 'FORBIDDEN_SCOPE', "You can only assign stations in your own cities.");
        }
      }
    }
  }

  private async assertUnique(input: { email?: string; phone?: string; excludeId?: string }) {
    if (input.email) {
      const hit = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (hit && hit.id !== input.excludeId) {
        throw new AppException(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }
    }
    if (input.phone) {
      const hit = await this.prisma.user.findUnique({ where: { phone: input.phone } });
      if (hit && hit.id !== input.excludeId) {
        throw new AppException(409, 'PHONE_TAKEN', 'An account with this phone number already exists.');
      }
    }
  }

  /** Backstop for races between the pre-check and the insert. */
  private mapUniqueError(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new AppException(409, 'CONFLICT', 'An account with these details already exists.');
    }
    return e;
  }
}
