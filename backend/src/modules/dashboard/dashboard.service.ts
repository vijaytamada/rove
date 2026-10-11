import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/app-exception.js';
import { TtlCache } from '../../common/ttl-cache.js';
import type { Env } from '../../config/env.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { BookingView } from '../bookings/booking-views.js';
import { BookingsService } from '../bookings/bookings.service.js';
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
  /** The raw numbers per slice, kept a few seconds: the heavy part of every staff dashboard, and the same for everyone who asks. */
  private readonly numbers: TtlCache<{ raw: Map<string, RawNumbers>; window: DashboardWindow }>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.numbers = new TtlCache(config.get('DASHBOARD_CACHE_SECONDS', { infer: true }) * 1000);
  }

  /** The numbers for `ids` (undefined = every station) over a range, from the short-lived cache when it is fresh enough. */
  private async rawFor(ids: Ids, range: RangeKey, now: Date) {
    const key = `${range}:${ids ? [...ids].sort().join(',') : '*'}`;
    return this.numbers.get(key, async () => {
      const window = resolveWindow(range, now);
      return { raw: await this.rawByStation(ids, window, now), window };
    });
  }

  // ---- staff dashboards ----

  /** Everything, with a row per city. */
  async admin(range: RangeKey, now = new Date()) {
    const [{ raw, window }, cities, stations] = await Promise.all([
      this.rawFor(undefined, range, now),
      this.prisma.city.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.station.findMany({ select: { id: true, cityId: true } }),
    ]);
    const rows = cities.map((c): CityRow => {
      const ids = stations.filter((st) => st.cityId === c.id).map((st) => st.id);
      const m = toMetrics(ids.map((id) => raw.get(id) ?? emptyRaw()), window);
      return { id: c.id, name: c.name, stations: ids.length, fleet: m.fleet, utilizationPercent: m.utilizationPercent, money: m.money, now: pickNow(m) };
    });
    return { ...toMetrics(stations.map((st) => raw.get(st.id) ?? emptyRaw()), window), cities: rows };
  }

  /** One city, with a row per station. Managers see their own cities; admins any. */
  async city(user: AuthUser, cityId: string, range: RangeKey, now = new Date()) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId }, select: { id: true, name: true, timezone: true } });
    if (!city) throw new AppException(404, 'CITY_NOT_FOUND', 'City not found.');
    await this.scopes.assertCityAccess(user, cityId);

    const stations = await this.prisma.station.findMany({ where: { cityId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const { raw, window } = await this.rawFor(stations.map((s) => s.id), range, now);
    const rows = stations.map((s): StationRow => {
      const m = toMetrics([raw.get(s.id) ?? emptyRaw()], window);
      return { stationId: s.id, id: s.id, name: s.name, fleet: m.fleet, utilizationPercent: m.utilizationPercent, money: m.money, now: pickNow(m) };
    });
    return { city, ...toMetrics(stations.map((s) => raw.get(s.id) ?? emptyRaw()), window), stations: rows };
  }

  /** One station and its queue: who is waiting for a scooter and who is out. */
  async station(user: AuthUser, stationId: string, range: RangeKey, now = new Date()) {
    await this.scopes.assertStationIdAccess(user, stationId);
    const station = await this.prisma.station.findUniqueOrThrow({
      where: { id: stationId },
      select: { id: true, name: true, city: { select: { id: true, name: true, timezone: true } } },
    });
    const [{ raw, window }, pickups, rides] = await Promise.all([
      this.rawFor([stationId], range, now),
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
      ...toMetrics([raw.get(stationId) ?? emptyRaw()], window),
      queue: { pickups: pickups.map(item), rides: rides.map(item) },
    };
  }

  // ---- customer dashboard ----

  /** A customer's own home: what needs attention, what is next, recent rides, what they owe. */
  async customer(user: AuthUser, now = new Date()): Promise<CustomerDashboard> {
    const [{ active, upcoming, recent }, owed, ride] = await Promise.all([
      this.bookings.homeBookings(user, now),
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
      active,
      upcoming,
      recent,
      owed: owed ? { bookingId: owed.bookingId, amount: owed.outstandingAmount } : null,
      stats: { rides: Number(ride[0]?.rides ?? 0), distanceKm: Math.round((ride[0]?.km ?? 0) * 10) / 10 },
    };
  }

  // ---- the numbers ----

  /**
   * The raw counts and sums for every station in `ids` (undefined = every station), in a fixed handful of queries however many
   * stations there are: each query groups by station, and cities and the network are added up from those rows. Rides, payments
   * and settlements belong to the station where the ride started.
   */
  private async rawByStation(ids: Ids, window: DashboardWindow, now: Date): Promise<Map<string, RawNumbers>> {
    const from = window.from.toISOString();
    const to = window.to.toISOString();
    const nowText = now.toISOString();
    const out = new Map<string, RawNumbers>();
    const of = (id: string) => {
      let r = out.get(id);
      if (!r) out.set(id, (r = emptyRaw()));
      return r;
    };
    const stationScope = (column: Prisma.Sql) => (ids ? Prisma.sql`AND ${column} = ANY(${ids}::uuid[])` : Prisma.empty);

    const [vehicles, bookings, rentals, payments, refunds, settlements] = await Promise.all([
      this.prisma.vehicle.groupBy({
        by: ['stationId', 'status'],
        where: { retiredAt: null, ...(ids ? { stationId: { in: ids } } : { stationId: { not: null } }) },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ sid: string; in_ride: bigint; overdue: bigint; waiting: bigint; new_bookings: bigint; cancellations: bigint; no_shows: bigint; held: bigint }[]>(Prisma.sql`
        SELECT b."stationId" AS sid,
          COUNT(*) FILTER (WHERE b.status = 'IN_RIDE') AS in_ride,
          COUNT(*) FILTER (WHERE b.status = 'IN_RIDE' AND b."endAt" < ${nowText}::timestamp) AS overdue,
          COUNT(*) FILTER (WHERE b.status = 'CONFIRMED' AND b."endAt" > ${nowText}::timestamp) AS waiting,
          COUNT(*) FILTER (WHERE b."confirmedAt" >= ${from}::timestamp AND b."confirmedAt" <= ${to}::timestamp) AS new_bookings,
          COUNT(*) FILTER (WHERE b."cancelledAt" >= ${from}::timestamp AND b."cancelledAt" <= ${to}::timestamp) AS cancellations,
          COUNT(*) FILTER (WHERE b.status = 'NO_SHOW' AND b."updatedAt" >= ${from}::timestamp AND b."updatedAt" <= ${to}::timestamp) AS no_shows,
          COALESCE(SUM(b."depositAmount") FILTER (WHERE b.status IN ('CONFIRMED', 'IN_RIDE', 'RETURNED')), 0) AS held
        FROM "Booking" b
        WHERE (b.status IN ('CONFIRMED', 'IN_RIDE', 'RETURNED') OR b."confirmedAt" >= ${from}::timestamp OR b."cancelledAt" >= ${from}::timestamp
               OR (b.status = 'NO_SHOW' AND b."updatedAt" >= ${from}::timestamp)) ${stationScope(Prisma.sql`b."stationId"`)}
        GROUP BY b."stationId"`),
      this.prisma.$queryRaw<{ sid: string; started: bigint; completed: bigint; hours: number }[]>(Prisma.sql`
        SELECT r."pickupStationId" AS sid,
          COUNT(*) FILTER (WHERE r."startedAt" >= ${from}::timestamp AND r."startedAt" <= ${to}::timestamp) AS started,
          COUNT(*) FILTER (WHERE r."endedAt" >= ${from}::timestamp AND r."endedAt" <= ${to}::timestamp) AS completed,
          COALESCE(SUM(EXTRACT(EPOCH FROM (
            LEAST(COALESCE(r."endedAt", ${to}::timestamp), ${to}::timestamp) - GREATEST(r."startedAt", ${from}::timestamp)
          ))) FILTER (WHERE r."startedAt" < ${to}::timestamp AND COALESCE(r."endedAt", ${to}::timestamp) > ${from}::timestamp) / 3600.0, 0)::float8 AS hours
        FROM "Rental" r
        WHERE (r."endedAt" IS NULL OR r."endedAt" >= ${from}::timestamp) ${stationScope(Prisma.sql`r."pickupStationId"`)}
        GROUP BY r."pickupStationId"`),
      this.prisma.$queryRaw<{ sid: string; collected: bigint }[]>(Prisma.sql`
        SELECT b."stationId" AS sid, SUM(p."chargeAmount") AS collected
        FROM "Payment" p JOIN "Booking" b ON b.id = p."bookingId"
        WHERE p.status = 'SUCCEEDED' AND p."paidAt" >= ${from}::timestamp AND p."paidAt" <= ${to}::timestamp ${stationScope(Prisma.sql`b."stationId"`)}
        GROUP BY b."stationId"`),
      this.prisma.$queryRaw<{ sid: string; refunded: bigint }[]>(Prisma.sql`
        SELECT b."stationId" AS sid, SUM(r."refundAmount") AS refunded
        FROM "Refund" r JOIN "Payment" p ON p.id = r."paymentId" JOIN "Booking" b ON b.id = p."bookingId"
        WHERE r.status = 'SUCCEEDED' AND r."createdAt" >= ${from}::timestamp AND r."createdAt" <= ${to}::timestamp ${stationScope(Prisma.sql`b."stationId"`)}
        GROUP BY b."stationId"`),
      this.prisma.$queryRaw<{ sid: string; owed_count: bigint; owed_amount: bigint; pending_count: bigint; pending_amount: bigint }[]>(Prisma.sql`
        SELECT b."stationId" AS sid,
          COUNT(*) FILTER (WHERE s.status = 'OUTSTANDING') AS owed_count,
          COALESCE(SUM(s."outstandingAmount") FILTER (WHERE s.status = 'OUTSTANDING'), 0) AS owed_amount,
          COUNT(*) FILTER (WHERE s.status = 'REFUND_PENDING') AS pending_count,
          COALESCE(SUM(s."refundAmount") FILTER (WHERE s.status = 'REFUND_PENDING'), 0) AS pending_amount
        FROM "Settlement" s JOIN "Booking" b ON b.id = s."bookingId"
        WHERE s.status IN ('OUTSTANDING', 'REFUND_PENDING') ${stationScope(Prisma.sql`b."stationId"`)}
        GROUP BY b."stationId"`),
    ]);

    for (const v of vehicles) if (v.stationId) of(v.stationId).atStation[v.status] = (of(v.stationId).atStation[v.status] ?? 0) + v._count._all;
    for (const b of bookings) {
      const r = of(b.sid);
      r.inRide = Number(b.in_ride);
      r.overdue = Number(b.overdue);
      r.waiting = Number(b.waiting);
      r.newBookings = Number(b.new_bookings);
      r.cancellations = Number(b.cancellations);
      r.noShows = Number(b.no_shows);
      r.held = Number(b.held);
    }
    for (const x of rentals) {
      const r = of(x.sid);
      r.ridesStarted = Number(x.started);
      r.ridesCompleted = Number(x.completed);
      r.rideHours = x.hours;
    }
    for (const x of payments) of(x.sid).collected = Number(x.collected);
    for (const x of refunds) of(x.sid).refunded = Number(x.refunded);
    for (const x of settlements) {
      const r = of(x.sid);
      r.owedCount = Number(x.owed_count);
      r.owedAmount = Number(x.owed_amount);
      r.pendingCount = Number(x.pending_count);
      r.pendingAmount = Number(x.pending_amount);
    }
    return out;
  }
}

/** Everything the dashboards add up, for one station. All of it can be summed, so a city or the network is the sum of its stations. */
export interface RawNumbers {
  atStation: Partial<Record<string, number>>;
  inRide: number;
  overdue: number;
  waiting: number;
  newBookings: number;
  ridesStarted: number;
  ridesCompleted: number;
  cancellations: number;
  noShows: number;
  collected: number;
  refunded: number;
  held: number;
  owedCount: number;
  owedAmount: number;
  pendingCount: number;
  pendingAmount: number;
  rideHours: number;
}

export const emptyRaw = (): RawNumbers => ({
  atStation: {},
  inRide: 0,
  overdue: 0,
  waiting: 0,
  newBookings: 0,
  ridesStarted: 0,
  ridesCompleted: 0,
  cancellations: 0,
  noShows: 0,
  collected: 0,
  refunded: 0,
  held: 0,
  owedCount: 0,
  owedAmount: 0,
  pendingCount: 0,
  pendingAmount: 0,
  rideHours: 0,
});

/** Adds up the stations of a slice (a station, a city, the network) and shapes the numbers the screens show. */
export function toMetrics(parts: RawNumbers[], window: DashboardWindow): DashboardMetrics {
  const sum = (pick: (r: RawNumbers) => number) => parts.reduce((n, r) => n + pick(r), 0);
  const atStation = (status: string) => sum((r) => r.atStation[status] ?? 0);
  const atStationTotal = sum((r) => Object.values(r.atStation).reduce<number>((n, c) => n + (c ?? 0), 0));
  const inRide = sum((r) => r.inRide);
  const fleetTotal = atStationTotal + inRide;
  const collected = sum((r) => r.collected);
  const refunded = sum((r) => r.refunded);
  return {
    window: { key: window.key, from: window.from, to: window.to, hours: window.hours },
    fleet: { total: fleetTotal, available: atStation('AVAILABLE'), inRide, maintenance: atStation('MAINTENANCE'), offline: atStation('OFFLINE') },
    utilizationPercent: utilizationPercent(sum((r) => r.rideHours), fleetTotal, window.hours),
    activity: {
      newBookings: sum((r) => r.newBookings),
      ridesStarted: sum((r) => r.ridesStarted),
      ridesCompleted: sum((r) => r.ridesCompleted),
      cancellations: sum((r) => r.cancellations),
      noShows: sum((r) => r.noShows),
    },
    money: { collected, refunded, net: collected - refunded },
    now: {
      waitingPickups: sum((r) => r.waiting),
      ridesOut: inRide,
      overdueRides: sum((r) => r.overdue),
      depositsHeld: sum((r) => r.held),
      owed: { count: sum((r) => r.owedCount), amount: sum((r) => r.owedAmount) },
      refundsPending: { count: sum((r) => r.pendingCount), amount: sum((r) => r.pendingAmount) },
    },
  };
}

const pickNow = (m: DashboardMetrics): CityRow['now'] => ({
  waitingPickups: m.now.waitingPickups,
  ridesOut: m.now.ridesOut,
  overdueRides: m.now.overdueRides,
  owed: m.now.owed,
  refundsPending: m.now.refundsPending,
});
