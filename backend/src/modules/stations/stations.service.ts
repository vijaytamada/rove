import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import { Prisma, type Station } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { liveBookingOverlap } from '../bookings/booking-availability.js';
import { isOpenAt } from '../bookings/booking-rules.js';
import { CitiesService } from '../cities/cities.service.js';
import { ScopeService } from '../rbac/scope.service.js';
import type { CreateStationDto, ListStationsQuery, UpdateStationDto } from './dto/station.dto.js';

export interface StationView {
  id: string;
  cityId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  opensAt: string | null;
  closesAt: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  /** Scooters free to rent here right now (in service, and not booked or held for payment). */
  availableVehicles: number;
  /** Whether the station is inside its opening hours right now (city time). Booking a later time is still possible. */
  openNow: boolean;
}

const toView = (s: Station, availableVehicles: number, openNow = true): StationView => ({
  id: s.id,
  cityId: s.cityId,
  name: s.name,
  address: s.address,
  latitude: s.latitude,
  longitude: s.longitude,
  capacity: s.capacity,
  opensAt: s.opensAt,
  closesAt: s.closesAt,
  status: s.status,
  availableVehicles,
  openNow,
});

@Injectable()
export class StationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(CitiesService) private readonly cities: CitiesService,
  ) {}

  /** Public: active stations of an active city. */
  async listPublic(cityId: string): Promise<StationView[]> {
    const city = await this.prisma.city.findFirst({ where: { id: cityId, isActive: true } });
    if (!city) throw new AppException(404, 'CITY_NOT_FOUND', 'City not found.');
    const stations = await this.prisma.station.findMany({
      where: { cityId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
    return this.withCounts(stations);
  }

  async getPublic(id: string): Promise<StationView> {
    const station = await this.prisma.station.findFirst({
      where: { id, status: 'ACTIVE', city: { isActive: true } },
    });
    if (!station) throw new AppException(404, 'STATION_NOT_FOUND', 'Station not found.');
    return (await this.withCounts([station]))[0];
  }

  /** Management list limited to the user's scope. */
  async listManage(user: AuthUser, query: ListStationsQuery): Promise<Page<StationView>> {
    const scoped = await this.scopes.stationFilter(user);
    const where: Prisma.StationWhereInput = {
      ...scoped,
      ...(query.cityId && { cityId: query.cityId }),
      ...(query.status && { status: query.status }),
    };
    const { page, limit, skip, take } = pageArgs(query);
    const [stations, total] = await this.prisma.$transaction([
      this.prisma.station.findMany({ where, orderBy: [{ cityId: 'asc' }, { name: 'asc' }], skip, take }),
      this.prisma.station.count({ where }),
    ]);
    return { items: await this.withCounts(stations), total, page, limit };
  }

  async create(user: AuthUser, dto: CreateStationDto): Promise<StationView> {
    await this.cities.getOrThrow(dto.cityId);
    await this.scopes.assertCityAccess(user, dto.cityId);
    this.assertHours(dto.opensAt, dto.closesAt);
    try {
      const station = await this.prisma.station.create({
        data: {
          cityId: dto.cityId,
          name: dto.name,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          capacity: dto.capacity,
          opensAt: dto.opensAt ?? null,
          closesAt: dto.closesAt ?? null,
          status: dto.status ?? 'ACTIVE',
        },
      });
      return toView(station, 0);
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateStationDto): Promise<StationView> {
    const current = await this.prisma.station.findUnique({ where: { id } });
    if (!current) throw new AppException(404, 'STATION_NOT_FOUND', 'Station not found.');
    await this.scopes.assertStationAccess(user, { stationId: id, cityId: current.cityId });

    const opensAt = dto.opensAt === undefined ? current.opensAt : dto.opensAt;
    const closesAt = dto.closesAt === undefined ? current.closesAt : dto.closesAt;
    this.assertHours(opensAt, closesAt);

    try {
      const station = await this.prisma.station.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.latitude !== undefined && { latitude: dto.latitude }),
          ...(dto.longitude !== undefined && { longitude: dto.longitude }),
          ...(dto.capacity !== undefined && { capacity: dto.capacity }),
          ...(dto.status !== undefined && { status: dto.status }),
          opensAt,
          closesAt,
        },
      });
      return (await this.withCounts([station]))[0];
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  private async withCounts(stations: Station[]): Promise<StationView[]> {
    if (stations.length === 0) return [];
    // "Available" means free to ride for the next hour: in service, and not booked or held by someone.
    const now = new Date();
    const counts = await this.prisma.vehicle.groupBy({
      by: ['stationId'],
      where: {
        stationId: { in: stations.map((s) => s.id) },
        status: 'AVAILABLE',
        retiredAt: null,
        bookings: { none: liveBookingOverlap(now, new Date(now.getTime() + 3_600_000), now) },
      },
      _count: { _all: true },
    });
    const byStation = new Map(counts.map((c) => [c.stationId, c._count._all]));
    const cities = await this.prisma.city.findMany({
      where: { id: { in: [...new Set(stations.map((s) => s.cityId))] } },
      select: { id: true, timezone: true },
    });
    const zone = new Map(cities.map((c) => [c.id, c.timezone]));
    return stations.map((s) =>
      toView(s, byStation.get(s.id) ?? 0, isOpenAt(now, s.opensAt, s.closesAt, zone.get(s.cityId) ?? 'Asia/Kolkata')),
    );
  }

  /** Opening hours are both set or both empty. */
  private assertHours(opensAt?: string | null, closesAt?: string | null) {
    if (Boolean(opensAt) !== Boolean(closesAt)) {
      throw new AppException(400, 'INVALID_HOURS', 'Set both opening and closing times, or neither.');
    }
  }

  private mapConflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new AppException(409, 'STATION_EXISTS', 'A station with this name already exists in this city.');
    }
    return e;
  }
}
