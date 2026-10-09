import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { BookingView } from '../bookings/booking-views.js';
import { BookingsService } from '../bookings/bookings.service.js';
import type { ListBookingsQuery } from '../bookings/dto/booking.dto.js';
import { ScopeService } from '../rbac/scope.service.js';
import { resolveWindow, utilizationPercent, type DashboardWindow, type RangeKey } from './dashboard-rules.js';

/** The same set of numbers for any slice of the network: everything, a city, or one station. */
export interface DashboardMetrics {
  window: { key: RangeKey; from: Date; to: Date; hours: number };
  /** Scooters in the slice. `inRide` ones are out on a ride, so they are not at any station. */
  fleet: { total: number; available: number; inRide: number; maintenance: number; offline: number };
  /** Ride hours divided by scooter-hours in the window, as a percentage (0-100, one decimal). */
  utilizationPercent: number;
  /** Counted inside the window. */
  activity: { newBookings: number; ridesStarted: number; ridesCompleted: number; cancellations: number; noShows: number };
  /** Paise moved inside the window: payments in, refunds out. */
  money: { collected: number; refunded: number; net: number };
  /** Right now, not tied to the window. */
  now: {
    waitingPickups: number;
    ridesOut: number;
    overdueRides: number;
    /** Deposits of paid bookings that have not been settled yet. */
    depositsHeld: number;
    owed: { count: number; amount: number };
    refundsPending: { count: number; amount: number };
  };
}

export interface CityRow {
  id: string;
  name: string;
  stations: number;
  fleet: DashboardMetrics['fleet'];
  utilizationPercent: number;
  money: DashboardMetrics['money'];
  now: Pick<DashboardMetrics['now'], 'waitingPickups' | 'ridesOut' | 'overdueRides' | 'owed' | 'refundsPending'>;
}

export interface StationRow extends Omit<CityRow, 'stations'> {
  stationId: string;
}

export interface QueueItem {
  id: string;
  code: string;
  customerName: string;
  vehicleCode: string;
  startAt: Date;
  endAt: Date;
  /** Out past its booked end. */
  overdue: boolean;
}

export interface CustomerDashboard {
  /** Something that needs attention now: a ride, a pickup today, an unpaid hold, or money owed. */
  active: BookingView | null;
  /** The next paid booking that has not started. */
  upcoming: BookingView | null;
  recent: BookingView[];
  owed: { bookingId: string; amount: number } | null;
  stats: { rides: number; distanceKm: number };
}

const QUEUE_LIMIT = 5;
type Ids = string[] | undefined;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
  ) {}

  // ---- staff dashboards ----

  /** Everything, with a row per city. */
  async admin(range: RangeKey, now = new Date()) {
    const window = resolveWindow(range, now);
    const [metrics, cities] = await Promise.all([this.metrics(undefined, window, now), this.prisma.city.findMany({ orderBy: { name: 'asc' } })]);
    const rows = await Promise.all(
      cities.map(async (c): Promise<CityRow> => {
        const ids = await this.stationIds({ cityId: c.id });
        const m = await this.metrics(ids, window, now);
        return {
          id: c.id,
          name: c.name,
          stations: ids.length,
          fleet: m.fleet,
          utilizationPercent: m.utilizationPercent,
          money: m.money,
          now: pickNow(m),
        };
      }),
    );
    return { ...metrics, cities: rows };
  }

  /** One city, with a row per station. Managers see their own cities; admins any. */
  async city(user: AuthUser, cityId: string, range: RangeKey, now = new Date()) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId }, select: { id: true, name: true, timezone: true } });
    if (!city) throw new AppException(404, 'CITY_NOT_FOUND', 'City not found.');
    await this.scopes.assertCityAccess(user, cityId);

    const window = resolveWindow(range, now);
    const stations = await this.prisma.station.findMany({ where: { cityId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const ids = stations.map((s) => s.id);
    const [metrics, rows] = await Promise.all([
      this.metrics(ids, window, now),
      Promise.all(
        stations.map(async (s): Promise<StationRow> => {
          const m = await this.metrics([s.id], window, now);
          return { stationId: s.id, id: s.id, name: s.name, fleet: m.fleet, utilizationPercent: m.utilizationPercent, money: m.money, now: pickNow(m) };
        }),
      ),
    ]);
    return { city, ...metrics, stations: rows };
  }

  /** One station and its queue: who is waiting for a scooter and who is out. */
  async station(user: AuthUser, stationId: string, range: RangeKey, now = new Date()) {
    await this.scopes.assertStationIdAccess(user, stationId);
    const station = await this.prisma.station.findUniqueOrThrow({
      where: { id: stationId },
      select: { id: true, name: true, city: { select: { id: true, name: true, timezone: true } } },
    });
    const window = resolveWindow(range, now);
    const [metrics, pickups, rides] = await Promise.all([
      this.metrics([stationId], window, now),
      this.prisma.booking.findMany({
        where: { stationId, status: 'CONFIRMED', endAt: { gt: now } },
        orderBy: { startAt: 'asc' },
        take: QUEUE_LIMIT,
        include: { user: { select: { fullName: true } }, vehicle: { select: { code: true } } },
      }),
      this.prisma.booking.findMany({
        where: { stationId, status: 'IN_RIDE' },
        orderBy: { endAt: 'asc' },
        take: QUEUE_LIMIT,
        include: { user: { select: { fullName: true } }, vehicle: { select: { code: true } } },
      }),
    ]);
    const item = (b: (typeof pickups)[number]): QueueItem => ({
      id: b.id,
      code: b.code,
      customerName: b.user.fullName,
      vehicleCode: b.vehicle.code,
      startAt: b.startAt,
      endAt: b.endAt,
      overdue: b.status === 'IN_RIDE' && b.endAt < now,
    });
    return {
      station: { id: station.id, name: station.name, cityId: station.city.id, cityName: station.city.name, timezone: station.city.timezone },
      ...metrics,
      queue: { pickups: pickups.map(item), rides: rides.map(item) },
    };
  }

  // ---- customer dashboard ----

  /** A customer's own home: what needs attention, what is next, recent rides, what they owe. */
  async customer(user: AuthUser, now = new Date()): Promise<CustomerDashboard> {
    const list = async (tab: 'active' | 'upcoming' | 'past', limit: number) =>
      (await this.bookings.list(user, { tab, limit, page: 1 } as ListBookingsQuery, now)).items;
    const [active, upcoming, recent, owed, ride] = await Promise.all([
      list('active', 1),
      list('upcoming', 1),
      list('past', 3),
      this.prisma.settlement.findFirst({
        where: { status: 'OUTSTANDING', booking: { is: { userId: user.id } } },
        select: { bookingId: true, outstandingAmount: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.$queryRaw<{ rides: bigint; km: number }[]>`
        SELECT COUNT(*) AS rides, COALESCE(SUM(r."endOdometerKm" - r."startOdometerKm"), 0)::float8 AS km
        FROM "Rental" r JOIN "Booking" b ON b.id = r."bookingId"
        WHERE b."userId" = ${user.id}::uuid AND r."endedAt" IS NOT NULL`,
    ]);
    return {
      active: active[0] ?? null,
      upcoming: upcoming[0] ?? null,
      recent,
      owed: owed ? { bookingId: owed.bookingId, amount: owed.outstandingAmount } : null,
      stats: { rides: Number(ride[0]?.rides ?? 0), distanceKm: Math.round((ride[0]?.km ?? 0) * 10) / 10 },
    };
  }

  // ---- the numbers ----

  private async stationIds(where: Prisma.StationWhereInput): Promise<string[]> {
    return (await this.prisma.station.findMany({ where, select: { id: true } })).map((s) => s.id);
  }

  /** `ids` undefined = the whole network. Rides, payments and settlements belong to the station the ride started at. */
  private async metrics(ids: Ids, window: DashboardWindow, now: Date): Promise<DashboardMetrics> {
    const { from, to } = window;
    const inWindow = { gte: from, lte: to };
    const byStation = ids ? { stationId: { in: ids } } : {};
    const bookingOf = ids ? { booking: { is: { stationId: { in: ids } } } } : {};

    const [atStation, inRide, overdueRides, waiting, newBookings, ridesStarted, ridesCompleted, cancellations, noShows, collected, refunded, held, owed, pending, rideHours] =
      await Promise.all([
        this.prisma.vehicle.groupBy({
          by: ['status'],
          where: { retiredAt: null, ...(ids ? { stationId: { in: ids } } : { stationId: { not: null } }) },
          _count: { _all: true },
        }),
        this.prisma.booking.count({ where: { ...byStation, status: 'IN_RIDE' } }),
        this.prisma.booking.count({ where: { ...byStation, status: 'IN_RIDE', endAt: { lt: now } } }),
        this.prisma.booking.count({ where: { ...byStation, status: 'CONFIRMED', endAt: { gt: now } } }),
        this.prisma.booking.count({ where: { ...byStation, confirmedAt: inWindow } }),
        this.prisma.rental.count({ where: { ...(ids ? { pickupStationId: { in: ids } } : {}), startedAt: inWindow } }),
        this.prisma.rental.count({ where: { ...(ids ? { pickupStationId: { in: ids } } : {}), endedAt: inWindow } }),
        this.prisma.booking.count({ where: { ...byStation, cancelledAt: inWindow } }),
        this.prisma.booking.count({ where: { ...byStation, status: 'NO_SHOW', updatedAt: inWindow } }),
        this.prisma.payment.aggregate({ _sum: { chargeAmount: true }, where: { status: 'SUCCEEDED', paidAt: inWindow, ...bookingOf } }),
        this.prisma.refund.aggregate({
          _sum: { refundAmount: true },
          where: { status: 'SUCCEEDED', createdAt: inWindow, ...(ids ? { payment: { is: bookingOf } } : {}) },
        }),
        this.prisma.booking.aggregate({ _sum: { depositAmount: true }, where: { ...byStation, status: { in: ['CONFIRMED', 'IN_RIDE', 'RETURNED'] } } }),
        this.prisma.settlement.aggregate({ _sum: { outstandingAmount: true }, _count: { _all: true }, where: { status: 'OUTSTANDING', ...bookingOf } }),
        this.prisma.settlement.aggregate({ _sum: { refundAmount: true }, _count: { _all: true }, where: { status: 'REFUND_PENDING', ...bookingOf } }),
        this.rideHours(ids, window),
      ]);

    const count = (s: string) => atStation.find((g) => g.status === s)?._count._all ?? 0;
    const atStationTotal = atStation.reduce((n, g) => n + g._count._all, 0);
    const fleetTotal = atStationTotal + inRide;
    const collectedAmount = collected._sum.chargeAmount ?? 0;
    const refundedAmount = refunded._sum.refundAmount ?? 0;

    return {
      window: { key: window.key, from, to, hours: window.hours },
      fleet: { total: fleetTotal, available: count('AVAILABLE'), inRide, maintenance: count('MAINTENANCE'), offline: count('OFFLINE') },
      utilizationPercent: utilizationPercent(rideHours, fleetTotal, window.hours),
      activity: { newBookings, ridesStarted, ridesCompleted, cancellations, noShows },
      money: { collected: collectedAmount, refunded: refundedAmount, net: collectedAmount - refundedAmount },
      now: {
        waitingPickups: waiting,
        ridesOut: inRide,
        overdueRides,
        depositsHeld: held._sum.depositAmount ?? 0,
        owed: { count: owed._count._all, amount: owed._sum.outstandingAmount ?? 0 },
        refundsPending: { count: pending._count._all, amount: pending._sum.refundAmount ?? 0 },
      },
    };
  }

  /** Hours of rides that fall inside the window (a ride still out counts until now). Dates go in as UTC text for the timestamp columns. */
  private async rideHours(ids: Ids, window: DashboardWindow): Promise<number> {
    const from = window.from.toISOString();
    const to = window.to.toISOString();
    const scope = ids ? Prisma.sql`AND r."pickupStationId" = ANY(${ids}::uuid[])` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ hours: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
        LEAST(COALESCE(r."endedAt", ${to}::timestamp), ${to}::timestamp) - GREATEST(r."startedAt", ${from}::timestamp)
      ))) / 3600.0, 0)::float8 AS hours
      FROM "Rental" r
      WHERE r."startedAt" < ${to}::timestamp AND COALESCE(r."endedAt", ${to}::timestamp) > ${from}::timestamp ${scope}`);
    return rows[0]?.hours ?? 0;
  }
}

const pickNow = (m: DashboardMetrics): CityRow['now'] => ({
  waitingPickups: m.now.waitingPickups,
  ridesOut: m.now.ridesOut,
  overdueRides: m.now.overdueRides,
  owed: m.now.owed,
  refundsPending: m.now.refundsPending,
});
