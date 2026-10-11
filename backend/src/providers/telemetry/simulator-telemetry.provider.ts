import { Injectable, Logger } from '@nestjs/common';
import { stepVehicle, type SimState } from './simulator-motion.js';
import type { TelemetryHost, TelemetryProvider, TelemetryReading } from './telemetry.provider.js';

/** A scooter out on a ride reports this often. */
export const RIDE_INTERVAL_MS = 10_000;
/** A parked scooter reports a heartbeat this often. */
export const PARKED_INTERVAL_MS = 5 * 60_000;

/**
 * Development stand-in for the trackers: every few seconds it asks the backend which scooters exist, moves the ones
 * that are out on a ride along a wandering path, and reports a slow heartbeat for the parked ones. Not for production.
 */
@Injectable()
export class SimulatorTelemetryProvider implements TelemetryProvider {
  readonly name = 'simulator';
  private readonly logger = new Logger('SimulatorTelemetryProvider');
  private readonly states = new Map<string, SimState>();
  private readonly lastSent = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SimulatorTelemetryProvider must not be used in production');
    }
  }

  start(host: TelemetryHost): void {
    this.timer = setInterval(() => void this.tick(host), RIDE_INTERVAL_MS);
    this.timer.unref();
    this.logger.log(`Simulating scooter trackers (rides every ${RIDE_INTERVAL_MS / 1000}s)`);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One round. Exposed so tests can drive it without a timer. */
  async tick(host: TelemetryHost, now = new Date()): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      const fleet = await host.listVehicles();
      const readings: TelemetryReading[] = [];
      for (const v of fleet) {
        const prev = this.states.get(v.id);
        const riding = v.status === 'IN_RIDE';
        const last = this.lastSent.get(v.id) ?? 0;
        // Parked scooters only report a heartbeat, and one more the moment they stop (so they jump to their station).
        const due = riding || prev?.moving || now.getTime() - last >= PARKED_INTERVAL_MS;
        if (!due) continue;
        const { state, reading } = stepVehicle(prev, v, now, Math.random);
        this.states.set(v.id, state);
        this.lastSent.set(v.id, now.getTime());
        readings.push(reading);
      }
      if (readings.length) await host.ingest(readings);
      return readings.length;
    } catch (e) {
      this.logger.error(`Simulator round failed: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    } finally {
      this.busy = false;
    }
  }
}
