import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import { Prisma, type Station, type Vehicle, type VehicleModel, type VehicleStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { liveBookingOverlap, liveBookingWhere } from '../bookings/booking-availability.js';
import { resolveWindow } from '../bookings/booking-rules.js';
import type { AvailabilityQuery } from '../bookings/dto/booking.dto.js';
import { PricingPlansService, type PricingView } from '../pricing/pricing-plans.service.js';
import { ScopeService } from '../rbac/scope.service.js';
import type {
  ChangeVehicleStatusDto,
  CreateVehicleDto,
  ListVehiclesQuery,
  UpdateVehicleDto,
} from './dto/vehicle.dto.js';
import { toModelView, type VehicleModelView } from './vehicle-models.service.js';
import { assertManualStatusChange, BUSY_STATUSES } from './vehicle-status.js';

type VehicleRow = Vehicle & { model: VehicleModel; station: Pick<Station, 'id' | 'name' | 'cityId'> | null };

/** What customers see when browsing a station. */
export interface VehiclePublicView {
  id: string;
  code: string;
  status: VehicleStatus;
  batteryPercent: number | null;
  model: VehicleModelView;
}

/** What customers see when choosing a scooter: the public view plus the price they would pay here. */
export interface VehicleBrowseView extends VehiclePublicView {
  /** Null when no pricing plan covers this model in this city; such a scooter cannot be booked yet. */
  pricing: PricingView | null;
}

/** What staff see. */
export interface VehicleManageView extends VehiclePublicView {
  registrationNumber: string | null;
  odometerKm: number;
  station: { id: string; name: string; cityId: string } | null;
  createdAt: Date;
}

const INCLUDE = {
  model: true,
  station: { select: { id: true, name: true, cityId: true } },
} satisfies Prisma.VehicleInclude;

const toPublic = (v: VehicleRow): VehiclePublicView => ({
  id: v.id,
  code: v.code,
  status: v.status,
  batteryPercent: v.batteryPercent,
  model: toModelView(v.model),
});

const toManage = (v: VehicleRow): VehicleManageView => ({
  ...toPublic(v),
  registrationNumber: v.registrationNumber,
  odometerKm: v.odometerKm,
  station: v.station,
  createdAt: v.createdAt,
});

@Injectable()
export class VehiclesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(PricingPlansService) private readonly plans: PricingPlansService,
  ) {}

  /**
   * Public: scooters free to rent at an active station for a window (default: the next hour), with their price.
   * Scooters with a booking or payment hold in that window are left out.
   */
  async listPublic(stationId: string, query: AvailabilityQuery = {}, now = new Date()): Promise<VehicleBrowseView[]> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, status: 'ACTIVE', city: { isActive: true } },
    });
    if (!station) throw new AppException(404, 'STATION_NOT_FOUND', 'Station not found.');
    const window = resolveWindow(query.startAt ? new Date(query.startAt) : undefined, query.hours ?? 1, now);
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        stationId,
        status: 'AVAILABLE',
        retiredAt: null,
        model: { isActive: true },
        bookings: { none: liveBookingOverlap(window.startAt, window.endAt, now) },
      },
      include: INCLUDE,
      orderBy: { code: 'asc' },
    });
    const pricing = await this.plans.resolveForModels(station.cityId, [...new Set(vehicles.map((v) => v.modelId))]);
    return vehicles.map((v) => ({ ...toPublic(v), pricing: pricing.get(v.modelId) ?? null }));
  }

  async listManage(user: AuthUser, query: ListVehiclesQuery): Promise<Page<VehicleManageView>> {
    const scoped = await this.scopes.stationFilter(user);
    const where: Prisma.VehicleWhereInput = {
      retiredAt: null,
      ...(scoped && { station: { is: scoped } }),
      ...(query.stationId && { stationId: query.stationId }),
      ...(query.cityId && { station: { is: { ...scoped, cityId: query.cityId } } }),
      ...(query.status && { status: query.status }),
      ...(query.modelId && { modelId: query.modelId }),
    };
    const { page, limit, skip, take } = pageArgs(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({ where, include: INCLUDE, orderBy: { code: 'asc' }, skip, take }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items: items.map(toManage), total, page, limit };
  }

  async get(user: AuthUser, id: string): Promise<VehicleManageView> {
    const vehicle = await this.load(id);
    if (vehicle.stationId) await this.scopes.assertStationIdAccess(user, vehicle.stationId);
    else if (user.role !== 'SUPER_ADMIN') throw new AppException(403, 'FORBIDDEN_SCOPE', "You don't have access to this vehicle.");
    return toManage(vehicle);
  }

  async create(user: AuthUser, dto: CreateVehicleDto): Promise<VehicleManageView> {
    const station = await this.scopes.assertStationIdAccess(user, dto.stationId);
    const model = await this.prisma.vehicleModel.findUnique({ where: { id: dto.modelId } });
    if (!model || !model.isActive) {
      throw new AppException(400, 'MODEL_NOT_FOUND', 'Choose an active vehicle model.');
    }

    try {
      // The station row is locked so parallel requests can't both take the last free slot.
      const created = await this.prisma.$transaction(async (tx) => {
        await this.lockStation(tx, station.id);
        await this.assertCapacity(tx, station.id);
        return tx.vehicle.create({
          data: {
            modelId: dto.modelId,
            stationId: dto.stationId,
            code: dto.code,
            registrationNumber: dto.registrationNumber ?? null,
            batteryPercent: dto.batteryPercent ?? null,
            odometerKm: dto.odometerKm ?? 0,
          },
          include: INCLUDE,
        });
      });
      return toManage(created);
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateVehicleDto): Promise<VehicleManageView> {
    const vehicle = await this.load(id);
    this.assertNotBusy(vehicle.status);
    if (vehicle.stationId) await this.scopes.assertStationIdAccess(user, vehicle.stationId);

    const moving = dto.stationId !== undefined && dto.stationId !== vehicle.stationId;
    if (moving) {
      await this.scopes.assertStationIdAccess(user, dto.stationId!);
      await this.assertNoLiveBookings(id);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (moving) {
          await this.lockStation(tx, dto.stationId!);
          await this.assertCapacity(tx, dto.stationId!);
        }
        return tx.vehicle.update({
          where: { id },
          data: {
            ...(moving && { stationId: dto.stationId }),
            ...(dto.registrationNumber !== undefined && { registrationNumber: dto.registrationNumber }),
            ...(dto.batteryPercent !== undefined && { batteryPercent: dto.batteryPercent }),
            ...(dto.odometerKm !== undefined && { odometerKm: dto.odometerKm }),
          },
          include: INCLUDE,
        });
      });
      return toManage(updated);
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  async changeStatus(user: AuthUser, id: string, dto: ChangeVehicleStatusDto): Promise<VehicleManageView> {
    const vehicle = await this.load(id);
    if (vehicle.stationId) await this.scopes.assertStationIdAccess(user, vehicle.stationId);
    else if (user.role !== 'SUPER_ADMIN') throw new AppException(403, 'FORBIDDEN_SCOPE', "You don't have access to this vehicle.");

    if (vehicle.status === dto.status) return toManage(vehicle);
    assertManualStatusChange(user.role, vehicle.status, dto.status);
    // Taking a scooter out of service while a customer holds a booking on it would strand them.
    if (dto.status !== 'AVAILABLE') await this.assertNoLiveBookings(id);

    // Guard against a booking taking the vehicle between the read and the write.
    const result = await this.prisma.vehicle.updateMany({
      where: { id, status: vehicle.status },
      data: { status: dto.status },
    });
    if (result.count === 0) throw new AppException(409, 'VEHICLE_CHANGED', 'This vehicle was just updated. Reload and try again.');
    return toManage(await this.load(id));
  }

  /** Soft delete: the vehicle disappears from lists and frees its station slot. */
  async retire(user: AuthUser, id: string): Promise<void> {
    const vehicle = await this.load(id);
    this.assertNotBusy(vehicle.status);
    if (vehicle.stationId) await this.scopes.assertStationIdAccess(user, vehicle.stationId);
    await this.assertNoLiveBookings(id);
    await this.prisma.vehicle.update({
      where: { id },
      data: { retiredAt: new Date(), status: 'OFFLINE', stationId: null },
    });
  }

  private async load(id: string): Promise<VehicleRow> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, retiredAt: null }, include: INCLUDE });
    if (!vehicle) throw new AppException(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');
    return vehicle;
  }

  private assertNotBusy(status: VehicleStatus) {
    if (BUSY_STATUSES.includes(status)) {
      throw new AppException(409, 'VEHICLE_BUSY', 'This vehicle is part of a booking or ride and cannot be changed.');
    }
  }

  /** A scooter with a paid or pending booking cannot be moved, retired or taken out of service. */
  private async assertNoLiveBookings(id: string) {
    const now = new Date();
    const count = await this.prisma.booking.count({ where: { vehicleId: id, endAt: { gt: now }, ...liveBookingWhere(now) } });
    if (count > 0) {
      throw new AppException(409, 'VEHICLE_BOOKED', 'This scooter has a customer booking. Wait for it to finish or cancel it first.');
    }
  }

  /** Serializes capacity-changing writes for one station (held until the transaction ends). */
  private async lockStation(tx: Prisma.TransactionClient, stationId: string) {
    await tx.$queryRaw`SELECT id FROM "Station" WHERE id = ${stationId}::uuid FOR UPDATE`;
  }

  private async assertCapacity(tx: Prisma.TransactionClient, stationId: string) {
    const [station, count] = await Promise.all([
      tx.station.findUniqueOrThrow({ where: { id: stationId }, select: { capacity: true } }),
      tx.vehicle.count({ where: { stationId, retiredAt: null } }),
    ]);
    if (count >= station.capacity) {
      throw new AppException(409, 'STATION_FULL', 'This station is at capacity.');
    }
  }

  private mapConflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = JSON.stringify(e.meta ?? {});
      return target.includes('registrationNumber')
        ? new AppException(409, 'REGISTRATION_TAKEN', 'A vehicle with this registration number already exists.')
        : new AppException(409, 'VEHICLE_CODE_TAKEN', 'A vehicle with this code already exists.');
    }
    return e;
  }
}
