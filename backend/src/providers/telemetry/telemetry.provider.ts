import type { VehicleStatus } from '../../generated/prisma/client.js';

export const TELEMETRY_PROVIDER = Symbol('TELEMETRY_PROVIDER');

/** One reading from a scooter's tracker. */
export interface TelemetryReading {
  vehicleId: string;
  /** When the tracker took it (its clock). */
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKmh: number;
  batteryPercent: number;
  odometerKm: number;
  ignition: boolean;
}

/** What a provider needs to know about a scooter to act like its tracker. */
export interface FleetVehicle {
  id: string;
  code: string;
  status: VehicleStatus;
  batteryPercent: number | null;
  odometerKm: number;
  /** Where it is parked, or the station it left from when it is out. Null when no station is known. */
  home: { latitude: number; longitude: number } | null;
}

/** What the backend offers a provider. */
export interface TelemetryHost {
  listVehicles(): Promise<FleetVehicle[]>;
  /** Hands readings to the backend (validated, stored, and the live position updated). */
  ingest(readings: TelemetryReading[]): Promise<void>;
}

/**
 * The source of readings. `mock` does nothing (readings arrive only through `POST /telemetry`), the simulator makes
 * them up, and a real device gateway (MQTT or HTTP, Phase 12) would call `host.ingest` as messages arrive.
 */
export interface TelemetryProvider {
  readonly name: string;
  start(host: TelemetryHost): void;
  stop(): void;
}
