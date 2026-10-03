import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { Prisma, Role, UserStatus, type User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ScopeService, type StaffScope } from '../rbac/scope.service.js';
import type { AssignmentDto, CreateStaffDto, ListUsersQuery, UpdateMeDto, UpdateUserDto } from './dto/user.dto.js';
import { PasswordService } from './password.service.js';

export interface UserView {
  id: string;
  email: string;
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

  async getView(id: string, includeScope = true): Promise<UserView> {
    const user = await this.getById(id);
    const scope = includeScope ? await this.scopes.getScope({ id: user.id, role: user.role }) : undefined;
    return toUserView(user, scope);
  }

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

  createStaff(dto: CreateStaffDto): Promise<User> {
    if (dto.role === 'CUSTOMER') {
      throw new AppException(400, 'INVALID_ROLE', 'Use registration to create customer accounts.');
    }
    return this.create(dto);
  }

  async updateMe(id: string, dto: UpdateMeDto): Promise<User> {
    const current = await this.getById(id);
    const phoneChanged = dto.phone !== undefined && dto.phone !== current.phone;
    if (phoneChanged) await this.assertUnique({ phone: dto.phone, excludeId: id });

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
          // Changing the phone number requires verifying it again.
          ...(phoneChanged && { phone: dto.phone, phoneVerifiedAt: null }),
        },
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async list(query: ListUsersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = query.role ? { role: query.role } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map((u) => toUserView(u)), total, page, limit };
  }

  async adminUpdate(actor: AuthUser, id: string, dto: UpdateUserDto): Promise<User> {
    await this.getById(id);
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

  async setAssignments(id: string, items: AssignmentDto[]): Promise<UserView> {
    const user = await this.getById(id);
    const assignments = validateAssignments(user.role, items);
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
