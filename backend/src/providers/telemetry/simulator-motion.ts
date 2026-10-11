// How a simulated scooter moves. Pure: no database, no clock, no randomness of its own (the caller passes `random`).
import type { FleetVehicle, TelemetryReading } from './telemetry.provider.js';

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in kilometres. */
export function distanceKmBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point `km` kilometres from `from` heading `headingDeg` (0 = north, 90 = east). */
export function moveBy(from: { latitude: number; longitude: number }, headingDeg: number, km: number) {
  const d = km / EARTH_RADIUS_KM;
  const h = toRad(headingDeg);
  const lat1 = toRad(from.latitude);
  const lng1 = toRad(from.longitude);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(h));
  const lng2 = lng1 + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { latitude: toDeg(lat2), longitude: ((toDeg(lng2) + 540) % 360) - 180 };
}

export const SIM = {
  MIN_SPEED_KMH: 10,
  MAX_SPEED_KMH: 32,
  /** Largest change of direction per step, degrees. */
  MAX_TURN_DEG: 20,
  /** Battery used per kilometre ridden, in percent. */
  BATTERY_PER_KM: 1.1,
  /** A step longer than this is treated as this long (the simulator was paused: do not teleport). */
  MAX_STEP_SECONDS: 60,
} as const;

export interface SimState {
  latitude: number;
  longitude: number;
  headingDeg: number;
  speedKmh: number;
  /** Fractional, so slow drain adds up between whole-percent readings. */
  battery: number;
  odometerKm: number;
  at: Date;
  moving: boolean;
}

/**
 * Next reading for one scooter. A scooter that is out on a ride (`IN_RIDE`) moves: its speed wanders between 10 and
 * 32 km/h, it turns a little each step, and the odometer and battery follow the distance. Any other scooter sits at its
 * station with the ignition off. A scooter that just came back is put at its station straight away.
 */
export function stepVehicle(
  prev: SimState | undefined,
  v: FleetVehicle,
  now: Date,
  random: () => number,
): { state: SimState; reading: TelemetryReading } {
  const riding = v.status === 'IN_RIDE';
  const home = v.home ?? { latitude: 12.9716, longitude: 77.5946 };
  const battery = prev?.battery ?? v.batteryPercent ?? 80;
  const odometerKm = prev?.odometerKm ?? v.odometerKm;

  let state: SimState;
  if (!riding) {
    state = { latitude: home.latitude, longitude: home.longitude, headingDeg: prev?.headingDeg ?? 0, speedKmh: 0, battery, odometerKm, at: now, moving: false };
  } else if (!prev?.moving) {
    // Just set off: start at the station, heading somewhere.
    state = {
      latitude: home.latitude,
      longitude: home.longitude,
      headingDeg: random() * 360,
      speedKmh: SIM.MIN_SPEED_KMH,
      battery,
      odometerKm,
      at: now,
      moving: true,
    };
  } else {
    const seconds = Math.min(SIM.MAX_STEP_SECONDS, Math.max(0, (now.getTime() - prev.at.getTime()) / 1000));
    const speedKmh = Math.min(SIM.MAX_SPEED_KMH, Math.max(SIM.MIN_SPEED_KMH, prev.speedKmh + (random() - 0.5) * 8));
    const headingDeg = (prev.headingDeg + (random() - 0.5) * 2 * SIM.MAX_TURN_DEG + 360) % 360;
    const km = (speedKmh * seconds) / 3600;
    const at = moveBy(prev, headingDeg, km);
    state = {
      ...at,
      headingDeg,
      speedKmh,
      battery: Math.max(0, prev.battery - km * SIM.BATTERY_PER_KM),
      odometerKm: prev.odometerKm + km,
      at: now,
      moving: true,
    };
  }

  return {
    state,
    reading: {
      vehicleId: v.id,
      recordedAt: now,
      latitude: state.latitude,
      longitude: state.longitude,
      speedKmh: Math.round(state.speedKmh * 10) / 10,
      batteryPercent: Math.round(state.battery),
      odometerKm: Math.round(state.odometerKm * 100) / 100,
      ignition: state.moving,
    },
  };
}
