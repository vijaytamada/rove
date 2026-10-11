import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import type { Env } from '../../config/env.js';
import type { Prisma, VehicleStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import type { FleetVehicle, TelemetryHost, TelemetryReading } from '../../providers/telemetry/telemetry.provider.js';
import { ScopeService } from '../rbac/scope.service.js';
import type { HistoryQuery } from './dto/telemetry.dto.js';
import { TELEMETRY_RULES, checkReadingTime, isStale } from './telemetry-rules.js';

const latestKey = (vehicleId: string) => `telemetry:latest:${vehicleId}`;

/** The newest reading of a scooter, as kept in Redis for the live map. */
interface Latest {
  recordedAt: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  batteryPercent: number;
  odometerKm: number;
  ignition: boolean;
}

export interface IngestResult {
  accepted: number;
  rejected: { index: number; reason: string }[];
}

export interface LivePosition {
  latitude: number;
  longitude: number;
  speedKmh: number;
  ignition: boolean;
  recordedAt: Date;
  /** The tracker has gone quiet for longer than it should. */
  stale: boolean;
  /** `TRACKER` = the scooter's own reading; `STATION` = no reading, shown where it is parked. */
  source: 'TRACKER' | 'STATION';
}

export interface LiveVehicleView {
  vehicleId: string;
  code: string;
  status: VehicleStatus;
  model: string;
  batteryPercent: number | null;
  station: { id: string; name: string } | null;
  /** The ride this scooter is out on. Never the rider's name. */
  booking: { id: string; code: string } | null;
  position: LivePosition | null;
}

export interface LiveFleetView {
  generatedAt: Date;
  stations: { id: string; name: string; cityId: string; latitude: number; longitude: number }[];
  vehicles: LiveVehicleView[];
}

export interface HistoryPoint {
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKmh: number;
  batteryPercent: number;
  odometerKm: number;
  ignition: boolean;
}

/**
 * Where a scooter shows on the map. A parked scooter whose last reading says it was still moving (it was just brought
 * back) is shown at its station; a scooter on a ride ignores a reading that is older than the ride.
 */
export function choosePosition(
  status: VehicleStatus,
  latest: Latest | null,
  station: { latitude: number; longitude: number } | null,
  rideStartedAt: Date | null,
  now: Date,
): LivePosition | null {
  const stationPosition = (): LivePosition | null =>
    station ? { latitude: station.latitude, longitude: station.longitude, speedKmh: 0, ignition: false, recordedAt: now, stale: false, source: 'STATION' } : null;

  if (status === 'IN_RIDE') {
    if (!latest) return null;
    const at = new Date(latest.recordedAt);
    if (rideStartedAt && at < rideStartedAt) return null;
    return { latitude: latest.latitude, longitude: latest.longitude, speedKmh: latest.speedKmh, ignition: latest.ignition, recordedAt: at, stale: isStale(status, at, now), source: 'TRACKER' };
  }
  if (!latest || latest.ignition || !station) return stationPosition();
  const at = new Date(latest.recordedAt);
  return { latitude: latest.latitude, longitude: latest.longitude, speedKmh: latest.speedKmh, ignition: latest.ignition, recordedAt: at, stale: isStale(status, at, now), source: 'TRACKER' };
}

/** Readings from the trackers: validated, stored as history, and the newest kept for the live fleet view. */
@Injectable()
export class TelemetryService implements TelemetryHost {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly retentionDays: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.retentionDays = config.get('TELEMETRY_RETENTION_DAYS', { infer: true });
  }

  // ---- what a provider sees ----

  async listVehicles(): Promise<FleetVehicle[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { retiredAt: null },
      select: {
        id: true,
        code: true,
        status: true,
        batteryPercent: true,
        odometerKm: true,
        station: { select: { latitude: true, longitude: true } },
        bookings: { where: { status: 'IN_RIDE' }, take: 1, select: { station: { select: { latitude: true, longitude: true } } } },
      },
    });
    return rows.map((v) => ({
      id: v.id,
      code: v.code,
      status: v.status,
      batteryPercent: v.batteryPercent,
      odometerKm: v.odometerKm,
      home: v.station ?? v.bookings[0]?.station ?? null,
    }));
  }

  /** Stores the readings that pass the checks; says why for each one that does not. Safe to repeat. */
  async ingestReadings(readings: TelemetryReading[], now = new Date()): Promise<IngestResult> {
    const rejected: IngestResult['rejected'] = [];
    const known = new Set(
      (await this.prisma.vehicle.findMany({ where: { id: { in: [...new Set(readings.map((r) => r.vehicleId))] } }, select: { id: true } })).map((v) => v.id),
    );
    const good: TelemetryReading[] = [];
    readings.forEach((r, index) => {
      const reason = !known.has(r.vehicleId) ? 'Unknown scooter.' : checkReadingTime(r.recordedAt, now);
      if (reason) rejected.push({ index, reason });
      else good.push(r);
    });
    if (good.length === 0) return { accepted: 0, rejected };

    const stored = await this.prisma.telemetryPoint.createMany({
      data: good.map((r) => ({
        vehicleId: r.vehicleId,
        recordedAt: r.recordedAt,
        latitude: r.latitude,
        longitude: r.longitude,
        speedKmh: r.speedKmh,
        batteryPercent: r.batteryPercent,
        odometerKm: r.odometerKm,
        ignition: r.ignition,
      })),
      skipDuplicates: true,
    });
    await this.updateLatest(good);
    return { accepted: stored.count, rejected };
  }

  /** The provider's way in; the same checks as the HTTP endpoint, and a bad reading is dropped, not fatal. */
  async ingest(readings: TelemetryReading[]): Promise<void> {
    const result = await this.ingestReadings(readings);
    if (result.rejected.length) this.logger.warn(`${result.rejected.length} reading(s) refused: ${result.rejected[0].reason}`);
  }

  // ---- what staff see ----

  async liveFleet(user: AuthUser, now = new Date()): Promise<LiveFleetView> {
    const where = await this.vehicleScope(user);
    const stationWhere = await this.scopes.stationFilter(user);
    const [vehicles, stations] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { retiredAt: null, ...where },
        include: {
          model: { select: { brand: true, name: true } },
          station: { select: { id: true, name: true, latitude: true, longitude: true } },
          bookings: {
            where: { status: 'IN_RIDE' },
            take: 1,
            select: { id: true, code: true, rental: { select: { startedAt: true } } },
          },
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.station.findMany({
        where: { status: 'ACTIVE', ...stationWhere },
        select: { id: true, name: true, cityId: true, latitude: true, longitude: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const latest = await this.latestOf(vehicles.map((v) => v.id));
    return {
      generatedAt: now,
      stations,
      vehicles: vehicles.map((v) => {
        const ride = v.bookings[0] ?? null;
        return {
          vehicleId: v.id,
          code: v.code,
          status: v.status,
          model: `${v.model.brand} ${v.model.name}`,
          batteryPercent: latest.get(v.id)?.batteryPercent ?? v.batteryPercent,
          station: v.station ? { id: v.station.id, name: v.station.name } : null,
          booking: ride ? { id: ride.id, code: ride.code } : null,
          position: choosePosition(v.status, latest.get(v.id) ?? null, v.station, ride?.rental?.startedAt ?? null, now),
        };
      }),
    };
  }

  /** The recent path of one scooter (default: the last 30 minutes), oldest first. 404 for a scooter outside the user's scope. */
  async history(user: AuthUser, vehicleId: string, query: HistoryQuery, now = new Date()): Promise<{ points: HistoryPoint[] }> {
    const visible = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, retiredAt: null, ...(await this.vehicleScope(user)) }, select: { id: true } });
    if (!visible) throw new AppException(404, 'VEHICLE_NOT_FOUND', 'Scooter not found.');
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 60_000);
    const rows = await this.prisma.telemetryPoint.findMany({
      where: { vehicleId, recordedAt: { gte: from, lte: to } },
      orderBy: { recordedAt: 'desc' },
      take: query.limit ?? TELEMETRY_RULES.HISTORY_DEFAULT,
      select: { recordedAt: true, latitude: true, longitude: true, speedKmh: true, batteryPercent: true, odometerKm: true, ignition: true },
    });
    return { points: rows.reverse() };
  }

  /** Deletes readings older than the retention period. */
  async prune(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retentionDays * 86_400_000);
    return (await this.prisma.telemetryPoint.deleteMany({ where: { recordedAt: { lt: cutoff } } })).count;
  }

  // ---- internals ----

  /**
   * Scooters a user may see: admins all; others the ones parked at their stations (managers: every station in their
   * cities) and the ones out on a ride in the cities they work in (they may have to take them back).
   */
  private async vehicleScope(user: AuthUser): Promise<Prisma.VehicleWhereInput> {
    const scope = await this.scopes.getScope(user);
    if (scope.unrestricted) return {};
    const stationWhere = (await this.scopes.stationFilter(user)) ?? {};
    const cityIds =
      user.role === 'CITY_MANAGER'
        ? scope.cityIds
        : (await this.prisma.station.findMany({ where: { id: { in: scope.stationIds } }, select: { cityId: true } })).map((s) => s.cityId);
    return {
      OR: [
        { station: { is: stationWhere } },
        { status: 'IN_RIDE', bookings: { some: { status: 'IN_RIDE', station: { cityId: { in: cityIds } } } } },
      ],
    };
  }

  private async latestOf(ids: string[]): Promise<Map<string, Latest>> {
    const out = new Map<string, Latest>();
    if (ids.length === 0) return out;
    const values = await this.redis.client.mget(ids.map(latestKey));
    values.forEach((raw, i) => {
      if (!raw) return;
      try {
        out.set(ids[i], JSON.parse(raw) as Latest);
      } catch {
        // A damaged entry is ignored; the next reading replaces it.
      }
    });
    return out;
  }

  /** Keeps only the newest reading per scooter, and never replaces a newer one with an older one. */
  private async updateLatest(readings: TelemetryReading[]): Promise<void> {
    const newest = new Map<string, TelemetryReading>();
    for (const r of readings) {
      const have = newest.get(r.vehicleId);
      if (!have || r.recordedAt > have.recordedAt) newest.set(r.vehicleId, r);
    }
    const current = await this.latestOf([...newest.keys()]);
    const pipeline = this.redis.client.pipeline();
    for (const [id, r] of newest) {
      const existing = current.get(id);
      if (existing && new Date(existing.recordedAt) >= r.recordedAt) continue;
      const value: Latest = {
        recordedAt: r.recordedAt.toISOString(),
        latitude: r.latitude,
        longitude: r.longitude,
        speedKmh: r.speedKmh,
        batteryPercent: r.batteryPercent,
        odometerKm: r.odometerKm,
        ignition: r.ignition,
      };
      pipeline.set(latestKey(id), JSON.stringify(value), 'EX', TELEMETRY_RULES.LATEST_TTL_SECONDS);
    }
    await pipeline.exec();
  }
}
