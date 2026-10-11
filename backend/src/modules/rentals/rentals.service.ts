import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { liveBookingOverlap } from '../bookings/booking-availability.js';
import { derivePin, normalizeBookingCode } from '../bookings/booking-codes.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { ScopeService } from '../rbac/scope.service.js';
import { SettlementsService } from '../settlements/settlements.service.js';
import type { ListStationBookingsQuery, PickupDto, ReturnDto } from './dto/rental.dto.js';
import {
  RENTAL_RULES,
  canMarkNoShow,
  canPickUp,
  canReturn,
  distanceKm,
  vehicleStatusAfterReturn,
} from './rental-rules.js';
import { STAFF_BOOKING_INCLUDE, toStaffBookingView, type StaffBookingRow, type StaffBookingView } from './rental-views.js';

const OVERLAP_CONSTRAINT = 'Booking_no_vehicle_overlap';

/** What a staff member may touch: stations they run, and the cities they work in (to see rides they can take back). */
interface Access {
  all: boolean;
  /** True when this user runs `station` (can hand over and mark no-shows there, or return to it). */
  operates: (station: { id: string; cityId: string }) => boolean;
  workCityIds: string[];
  /** Prisma filter for stations this user runs; undefined = every station. */
  stationWhere: Prisma.StationWhereInput | undefined;
}

/** Hand a scooter over, take it back, and handle customers who never turn up. Station staff, managers and admins only. */
@Injectable()
export class RentalsService {
  private readonly logger = new Logger(RentalsService.name);
  private readonly pinSecret: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(SettlementsService) private readonly settlements: SettlementsService,
    @Inject(NotificationEventsService) private readonly events: NotificationEventsService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.pinSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  // ---- reading ----

  async list(user: AuthUser, query: ListStationBookingsQuery, now = new Date()): Promise<Page<StaffBookingView>> {
    const access = await this.access(user);
    if (query.stationId) await this.scopes.assertStationIdAccess(user, query.stationId);

    const ranOnStation: Prisma.BookingWhereInput = {
      station: { is: { ...access.stationWhere, ...(query.stationId && { id: query.stationId }) } },
    };
    // Finished rides also show at the station that took the scooter back.
    const returnedHere: Prisma.BookingWhereInput = {
      rental: { is: { returnStation: { is: { ...access.stationWhere, ...(query.stationId && { id: query.stationId }) } } } },
    };
    const outInCity: Prisma.BookingWhereInput = {
      status: 'IN_RIDE',
      ...(!access.all && { station: { is: { cityId: { in: access.workCityIds } } } }),
    };

    const tabs: Record<string, Prisma.BookingWhereInput> = {
      pickups: { AND: [{ status: 'CONFIRMED', endAt: { gt: now } }, ranOnStation] },
      past: {
        AND: [
          { status: { in: ['RETURNED', 'SETTLED', 'NO_SHOW'] }, updatedAt: { gt: new Date(now.getTime() - 7 * 86_400_000) } },
          { OR: [ranOnStation, returnedHere] },
        ],
      },
      rides: outInCity,
    };
    const everything: Prisma.BookingWhereInput = {
      OR: [{ AND: [{ status: { in: ['CONFIRMED', 'RETURNED', 'SETTLED', 'NO_SHOW'] } }, { OR: [ranOnStation, returnedHere] }] }, outInCity],
    };

    const text = this.textFilter(query.q);
    if (query.q && !text) {
      return { items: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 20 };
    }
    const where: Prisma.BookingWhereInput = {
      AND: [query.tab ? tabs[query.tab] : query.q ? everything : tabs.pickups, ...(text ? [text] : [])],
    };

    const { page, limit, skip, take } = pageArgs(query);
    const orderBy: Prisma.BookingOrderByWithRelationInput =
      query.tab === 'past' ? { updatedAt: 'desc' } : query.tab === 'rides' ? { endAt: 'asc' } : { startAt: 'asc' };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({ where, include: STAFF_BOOKING_INCLUDE, orderBy, skip, take }),
      this.prisma.booking.count({ where }),
    ]);
    const items = await Promise.all(rows.map((r) => this.view(r, access, now, false)));
    return { items, total, page, limit };
  }

  async get(user: AuthUser, id: string, now = new Date()): Promise<StaffBookingView> {
    const access = await this.access(user);
    const row = await this.load(id);
    this.assertCanView(access, row);
    return this.view(row, access, now, true);
  }

  // ---- acting ----

  /** Hand the scooter to the customer who shows the right PIN. */
  async pickup(user: AuthUser, id: string, dto: PickupDto, now = new Date()): Promise<StaffBookingView> {
    const access = await this.access(user);
    const row = await this.load(id);
    if (!access.operates(row.station)) throw this.wrongStation();

    const state = canPickUp(row, now);
    if (!state.allowed) throw new AppException(409, 'PICKUP_NOT_ALLOWED', state.reason!);
    await this.checkPin(row.id, dto.pin);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id}::uuid FOR UPDATE`;
        const b = await tx.booking.findUniqueOrThrow({ where: { id } });
        const again = canPickUp(b, now);
        if (!again.allowed) throw new AppException(409, 'PICKUP_NOT_ALLOWED', again.reason!);

        const replacementId = dto.replacementVehicleId && dto.replacementVehicleId !== b.vehicleId ? dto.replacementVehicleId : null;
        // Lock the scooters in a fixed order so two handovers can never wait on each other.
        for (const vid of [b.vehicleId, replacementId].filter((v): v is string => v !== null).sort()) {
          await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vid}::uuid FOR UPDATE`;
        }
        const booked = await tx.vehicle.findUniqueOrThrow({ where: { id: b.vehicleId } });

        let vehicle = booked;
        let swapped = false;
        if (replacementId) {
          if (!dto.swapReason) {
            throw new AppException(400, 'SWAP_REASON_REQUIRED', 'Say why a different scooter is being handed over.');
          }
          const replacement = await tx.vehicle.findFirst({
            where: { id: replacementId, retiredAt: null, status: 'AVAILABLE', stationId: b.stationId, modelId: booked.modelId },
          });
          const clash = replacement
            ? await tx.booking.count({
                where: { vehicleId: replacement.id, id: { not: b.id }, ...liveBookingOverlap(b.startAt, b.endAt, now) },
              })
            : 0;
          if (!replacement || clash > 0) {
            throw new AppException(
              409,
              'REPLACEMENT_NOT_AVAILABLE',
              'That scooter cannot be handed over: it must be the same model, at this station, in service and not booked for this time.',
            );
          }
          vehicle = replacement;
          swapped = true;
        } else if (booked.retiredAt || booked.status !== 'AVAILABLE' || booked.stationId !== b.stationId) {
          throw new AppException(
            409,
            'VEHICLE_UNAVAILABLE',
            'The booked scooter is not here and ready. Hand over another scooter of the same model.',
          );
        }

        if (dto.startOdometerKm < vehicle.odometerKm) {
          throw new AppException(
            400,
            'ODOMETER_BEHIND',
            `The odometer reads less than the last recorded ${vehicle.odometerKm} km. Check the reading.`,
          );
        }

        await tx.booking.update({ where: { id }, data: { status: 'IN_RIDE', vehicleId: vehicle.id } });
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { status: 'IN_RIDE', stationId: null, odometerKm: dto.startOdometerKm, batteryPercent: dto.startBatteryPercent },
        });
        await tx.rental.create({
          data: {
            bookingId: id,
            vehicleId: vehicle.id,
            pickupStationId: b.stationId,
            pickupEmployeeId: user.id,
            startedAt: now,
            startOdometerKm: dto.startOdometerKm,
            startBatteryPercent: dto.startBatteryPercent,
            originalVehicleId: swapped ? booked.id : null,
            swapReason: swapped ? dto.swapReason! : null,
            damages: {
              create: (dto.damages ?? []).map((d) => ({
                phase: 'PICKUP' as const,
                description: d.description,
                severity: d.severity,
                recordedById: user.id,
              })),
            },
          },
        });
      });
    } catch (e) {
      throw this.mapOverlap(e);
    }
    await this.events.rideStarted(id);
    return this.get(user, id, now);
  }

  /** Take the scooter back at any station of the same city. */
  async returnRental(user: AuthUser, id: string, dto: ReturnDto, now = new Date()): Promise<StaffBookingView> {
    const row = await this.load(id);
    const state = canReturn(row);
    if (!state.allowed) throw new AppException(409, 'RETURN_NOT_ALLOWED', state.reason!);

    const station = await this.scopes.assertStationIdAccess(user, dto.returnStationId);
    if (station.cityId !== row.station.cityId) {
      throw new AppException(409, 'RETURN_CITY_MISMATCH', `This scooter must come back to a station in ${row.station.city.name}.`);
    }

    const bill = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id}::uuid FOR UPDATE`;
      const b = await tx.booking.findUniqueOrThrow({ where: { id }, include: { rental: true } });
      if (b.status !== 'IN_RIDE' || !b.rental) {
        throw new AppException(409, 'RETURN_NOT_ALLOWED', canReturn(b).reason ?? 'This scooter is not out on a ride.');
      }
      const rental = b.rental;
      if (dto.endOdometerKm < rental.startOdometerKm) {
        throw new AppException(
          400,
          'ODOMETER_BEHIND',
          `The odometer reads less than at pickup (${rental.startOdometerKm} km). Check the reading.`,
        );
      }
      if (dto.endOdometerKm - rental.startOdometerKm > RENTAL_RULES.MAX_RIDE_KM) {
        throw new AppException(400, 'ODOMETER_TOO_FAR', 'That is a very long ride. Check the odometer reading.');
      }

      const target = await tx.station.findUniqueOrThrow({ where: { id: dto.returnStationId } });
      if (target.status !== 'ACTIVE') {
        throw new AppException(409, 'RETURN_STATION_INACTIVE', 'That station is closed. Choose another.');
      }
      // The station row is locked so two returns cannot both take the last free slot.
      await tx.$queryRaw`SELECT id FROM "Station" WHERE id = ${target.id}::uuid FOR UPDATE`;
      const parked = await tx.vehicle.count({ where: { stationId: target.id, retiredAt: null } });
      if (parked >= target.capacity) throw new AppException(409, 'STATION_FULL', 'This station is full. Return it to another station.');

      await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${b.vehicleId}::uuid FOR UPDATE`;
      const damages = dto.damages ?? [];
      await tx.rental.update({
        where: { id: rental.id },
        data: {
          endedAt: now,
          endOdometerKm: dto.endOdometerKm,
          endBatteryPercent: dto.endBatteryPercent,
          returnStationId: target.id,
          returnEmployeeId: user.id,
          damages: {
            create: damages.map((d) => ({
              phase: 'RETURN' as const,
              description: d.description,
              severity: d.severity,
              feeAmount: d.feeAmount ?? 0,
              recordedById: user.id,
            })),
          },
        },
      });
      await tx.booking.update({ where: { id }, data: { status: 'RETURNED' } });
      await tx.vehicle.update({
        where: { id: b.vehicleId },
        data: {
          status: vehicleStatusAfterReturn(damages, dto.sendToMaintenance ?? false),
          stationId: target.id,
          odometerKm: dto.endOdometerKm,
          batteryPercent: dto.endBatteryPercent,
        },
      });

      // The final bill is made in the same transaction, so a ride is never returned without one.
      return this.settlements.createInTx(tx, {
        bookingId: id,
        hours: b.hours,
        bookedEndAt: b.endAt,
        returnedAt: now,
        distanceKm: distanceKm(rental.startOdometerKm, dto.endOdometerKm),
        pricingSnapshot: b.pricingSnapshot,
        damages: damages.map((d) => ({ description: d.description, feeAmount: d.feeAmount ?? 0 })),
      });
    });

    // The refund talks to the gateway, so it happens after the return is saved. If it fails the settlement stays
    // REFUND_PENDING and staff can retry from the settlements list.
    if (bill.needsRefund) {
      try {
        await this.settlements.finishRefund(bill.settlementId);
      } catch (e) {
        this.logger.error(`Deposit refund for settlement ${bill.settlementId} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await this.events.rideCompleted(id);
    return this.get(user, id, now);
  }

  /** The customer never came. The deposit goes back, the rental is kept. */
  async markNoShow(user: AuthUser, id: string, now = new Date()): Promise<StaffBookingView> {
    const access = await this.access(user);
    const row = await this.load(id);
    if (!access.operates(row.station)) throw this.wrongStation();
    const state = canMarkNoShow(row, now);
    if (!state.allowed) throw new AppException(409, 'NO_SHOW_NOT_ALLOWED', state.reason!);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id}::uuid FOR UPDATE`;
      const b = await tx.booking.findUniqueOrThrow({ where: { id } });
      const again = canMarkNoShow(b, now);
      if (!again.allowed) throw new AppException(409, 'NO_SHOW_NOT_ALLOWED', again.reason!);
      await tx.booking.update({ where: { id }, data: { status: 'NO_SHOW' } });
    });

    const paid = await this.prisma.payment.findFirst({
      where: { bookingId: id, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
    });
    let sent = true;
    if (paid && row.depositAmount > 0) {
      sent = await this.payments.refund(paid.id, row.depositAmount, paid.providerRef, 'NO_SHOW');
    }
    await this.events.noShow(id, { amount: paid ? row.depositAmount : 0, sent });
    return this.get(user, id, now);
  }

  // ---- internals ----

  private async load(id: string): Promise<StaffBookingRow> {
    const row = await this.prisma.booking.findUnique({ where: { id }, include: STAFF_BOOKING_INCLUDE });
    if (!row) throw new AppException(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    return row;
  }

  private async access(user: AuthUser): Promise<Access> {
    const scope = await this.scopes.getScope(user);
    if (scope.unrestricted) return { all: true, operates: () => true, workCityIds: [], stationWhere: undefined };
    if (user.role === 'CITY_MANAGER') {
      const cities = new Set(scope.cityIds);
      return {
        all: false,
        operates: (s) => cities.has(s.cityId),
        workCityIds: scope.cityIds,
        stationWhere: { cityId: { in: scope.cityIds } },
      };
    }
    const stations = new Set(scope.stationIds);
    const own = await this.prisma.station.findMany({ where: { id: { in: scope.stationIds } }, select: { cityId: true } });
    return {
      all: false,
      operates: (s) => stations.has(s.id),
      workCityIds: [...new Set(own.map((s) => s.cityId))],
      stationWhere: { id: { in: scope.stationIds } },
    };
  }

  /** A booking is visible to the stations it was booked at, and (while out on a ride) to the whole city's staff, who may take it back. */
  private assertCanView(access: Access, row: StaffBookingRow) {
    if (access.operates(row.station)) return;
    if (row.status === 'IN_RIDE' && access.workCityIds.includes(row.station.cityId)) return;
    // ...and to the station that took it back.
    if (row.rental?.returnStation && access.operates(row.rental.returnStation)) return;
    // Not found rather than forbidden: staff of other stations cannot tell the booking exists.
    throw new AppException(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  }

  private wrongStation() {
    return new AppException(403, 'FORBIDDEN_SCOPE', 'This booking is for a station you do not run.');
  }

  /** Builds a code / phone / name search from what staff typed. Null when nothing sensible can be searched. */
  private textFilter(q: string | undefined): Prisma.BookingWhereInput | null {
    const text = q?.trim();
    if (!text) return null;
    const or: Prisma.BookingWhereInput[] = [];
    const code = normalizeBookingCode(text);
    if (code) or.push({ code });
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 4) or.push({ user: { is: { phone: { contains: digits } } } });
    if (/\p{L}/u.test(text) && text.length >= 2) or.push({ user: { is: { fullName: { contains: text, mode: 'insensitive' } } } });
    return or.length > 0 ? { OR: or } : null;
  }

  private async view(row: StaffBookingRow, access: Access, now: Date, detail: boolean): Promise<StaffBookingView> {
    const here = access.operates(row.station);
    const noAccess = { allowed: false, reason: 'This booking is for a station you do not run.' };
    const pickup = here ? canPickUp(row, now) : noAccess;
    const noShow = here ? canMarkNoShow(row, now) : noAccess;

    let returnStations: { id: string; name: string }[] = [];
    if (row.status === 'IN_RIDE') {
      const candidates = await this.prisma.station.findMany({
        where: { cityId: row.station.cityId, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      });
      returnStations = candidates.filter((s) => access.operates(s)).map((s) => ({ id: s.id, name: s.name }));
    }
    const ret = canReturn(row);
    const returning = ret.allowed && returnStations.length === 0
      ? { allowed: false, reason: 'You do not run a station in this city.' }
      : ret;

    let swapOptions: { id: string; code: string; batteryPercent: number | null }[] = [];
    if (detail && pickup.allowed) {
      const options = await this.prisma.vehicle.findMany({
        where: {
          id: { not: row.vehicleId },
          modelId: row.vehicle.modelId,
          stationId: row.stationId,
          status: 'AVAILABLE',
          retiredAt: null,
          bookings: { none: { id: { not: row.id }, ...liveBookingOverlap(row.startAt, row.endAt, now) } },
        },
        orderBy: { code: 'asc' },
      });
      swapOptions = options.map((v) => ({ id: v.id, code: v.code, batteryPercent: v.batteryPercent }));
    }
    return toStaffBookingView(row, { actions: { pickup, return: returning, noShow }, returnStations: detail ? returnStations : [], swapOptions });
  }

  /** Five wrong guesses lock handover of that booking for fifteen minutes. */
  private async checkPin(bookingId: string, pin: string) {
    const key = `pickup:pin:fail:${bookingId}`;
    const failures = Number((await this.redis.client.get(key)) ?? 0);
    if (failures >= RENTAL_RULES.MAX_PIN_FAILURES) {
      const ttl = await this.redis.client.ttl(key);
      const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : RENTAL_RULES.PIN_LOCK_SECONDS) / 60));
      throw new AppException(429, 'PIN_LOCKED', `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
    const expected = Buffer.from(derivePin(this.pinSecret, bookingId));
    const given = Buffer.from(pin);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, RENTAL_RULES.PIN_LOCK_SECONDS);
      throw new AppException(403, 'PIN_INVALID', "That PIN doesn't match this booking. Ask the customer to check their booking.");
    }
    await this.redis.client.del(key);
  }

  private mapOverlap(e: unknown): unknown {
    if (e instanceof Error && e.message.includes(OVERLAP_CONSTRAINT)) {
      return new AppException(409, 'REPLACEMENT_NOT_AVAILABLE', 'That scooter is booked for this time.');
    }
    return e;
  }
}
