import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import { isValidTimeZone } from '../../common/timezone.js';
import { Prisma, type City } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ScopeService } from '../rbac/scope.service.js';
import type { CreateCityDto, ListCitiesQuery, UpdateCityDto } from './dto/city.dto.js';

export interface CityView {
  id: string;
  name: string;
  state: string;
  timezone: string;
  isActive: boolean;
}

export const toCityView = (c: City): CityView => ({
  id: c.id,
  name: c.name,
  state: c.state,
  timezone: c.timezone,
  isActive: c.isActive,
});

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

@Injectable()
export class CitiesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
  ) {}

  /** Public: active cities only. */
  async listPublic(): Promise<CityView[]> {
    const cities = await this.prisma.city.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return cities.map(toCityView);
  }

  /** Management list, limited to the user's scope (admins: all; managers: their cities). */
  async listManage(user: AuthUser, query: ListCitiesQuery): Promise<Page<CityView>> {
    const scope = await this.scopes.getScope(user);
    const where: Prisma.CityWhereInput = scope.unrestricted ? {} : { id: { in: scope.cityIds } };
    const { page, limit, skip, take } = pageArgs(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.city.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.city.count({ where }),
    ]);
    return { items: items.map(toCityView), total, page, limit };
  }

  async create(dto: CreateCityDto): Promise<CityView> {
    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    this.assertTimeZone(timezone);
    try {
      return toCityView(await this.prisma.city.create({ data: { name: dto.name, state: dto.state, timezone } }));
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  async update(id: string, dto: UpdateCityDto): Promise<CityView> {
    await this.getOrThrow(id);
    if (dto.timezone !== undefined) this.assertTimeZone(dto.timezone);
    try {
      return toCityView(await this.prisma.city.update({ where: { id }, data: dto }));
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  async getOrThrow(id: string): Promise<City> {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new AppException(404, 'CITY_NOT_FOUND', 'City not found.');
    return city;
  }

  private assertTimeZone(tz: string) {
    if (!isValidTimeZone(tz)) {
      throw new AppException(400, 'INVALID_TIMEZONE', 'Use an IANA time zone such as Asia/Kolkata.');
    }
  }

  private mapConflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new AppException(409, 'CITY_EXISTS', 'A city with this name already exists in this state.');
    }
    return e;
  }
}
