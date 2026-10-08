// Rules for handing a scooter over and taking it back. No database, no framework.
import type { BookingStatus, DamageSeverity, VehicleStatus } from '../../generated/prisma/client.js';

export const RENTAL_RULES = {
  /** Staff may hand the scooter over this long before the booked start. */
  PICKUP_EARLY_MINUTES: 15,
  /** A customer who has not turned up this long after the start can be marked a no-show (or at the end of the booking, if sooner). */
  NO_SHOW_AFTER_MINUTES: 60,
  /** Wrong PIN guesses allowed per booking before pickup is locked for a while. */
  MAX_PIN_FAILURES: 5,
  PIN_LOCK_SECONDS: 15 * 60,
  /** A reading further than this from the start is almost certainly a typo. */
  MAX_RIDE_KM: 2000,
} as const;

const MINUTE = 60_000;

export interface Window {
  status: BookingStatus;
  startAt: Date;
  endAt: Date;
}

export interface Allowed {
  allowed: boolean;
  /** Plain-language reason when not allowed. */
  reason?: string;
}

/** When the scooter can first be handed over. */
export const pickupOpensAt = (b: Pick<Window, 'startAt'>): Date =>
  new Date(b.startAt.getTime() - RENTAL_RULES.PICKUP_EARLY_MINUTES * MINUTE);

/** Only a paid, not yet started booking, from a little before its start until the booked time is over. */
export function canPickUp(b: Window, now: Date): Allowed {
  if (b.status !== 'CONFIRMED') return { allowed: false, reason: statusReason(b.status, 'be picked up') };
  if (now.getTime() < pickupOpensAt(b).getTime()) {
    return { allowed: false, reason: `Too early. Pickup opens ${RENTAL_RULES.PICKUP_EARLY_MINUTES} minutes before the start time.` };
  }
  if (now.getTime() >= b.endAt.getTime()) {
    return { allowed: false, reason: 'The booked time is over. Mark it as a no-show instead.' };
  }
  return { allowed: true };
}

/** The moment a booking can be marked a no-show: an hour after the start, or the end of the booking if that is sooner. */
export const noShowFrom = (b: Pick<Window, 'startAt' | 'endAt'>): Date =>
  new Date(Math.min(b.startAt.getTime() + RENTAL_RULES.NO_SHOW_AFTER_MINUTES * MINUTE, b.endAt.getTime()));

export function canMarkNoShow(b: Window, now: Date): Allowed {
  if (b.status !== 'CONFIRMED') return { allowed: false, reason: statusReason(b.status, 'be marked as a no-show') };
  if (now.getTime() < noShowFrom(b).getTime()) {
    return { allowed: false, reason: `The customer has until ${RENTAL_RULES.NO_SHOW_AFTER_MINUTES} minutes after the start time to arrive.` };
  }
  return { allowed: true };
}

export const canReturn = (b: Pick<Window, 'status'>): Allowed =>
  b.status === 'IN_RIDE' ? { allowed: true } : { allowed: false, reason: statusReason(b.status, 'be returned') };

function statusReason(status: BookingStatus, action: string): string {
  switch (status) {
    case 'PENDING_PAYMENT':
      return `This booking is not paid yet, so it cannot ${action}.`;
    case 'IN_RIDE':
      return `The scooter is already out on a ride, so it cannot ${action}.`;
    case 'RETURNED':
    case 'SETTLED':
      return `The scooter has already been returned, so it cannot ${action}.`;
    case 'CANCELLED':
      return `This booking was cancelled, so it cannot ${action}.`;
    case 'EXPIRED':
      return `This booking expired before it was paid, so it cannot ${action}.`;
    case 'NO_SHOW':
      return `This booking was marked as a no-show, so it cannot ${action}.`;
    default:
      return `This booking cannot ${action}.`;
  }
}

/** Moderate or major damage, or a staff request, takes the scooter out of service until someone looks at it. */
export function vehicleStatusAfterReturn(damages: { severity: DamageSeverity }[], sendToMaintenance: boolean): VehicleStatus {
  const serious = damages.some((d) => d.severity === 'MODERATE' || d.severity === 'MAJOR');
  return serious || sendToMaintenance ? 'MAINTENANCE' : 'AVAILABLE';
}

/** Distance ridden, to one decimal place. */
export const distanceKm = (startKm: number, endKm: number): number => Math.round((endKm - startKm) * 10) / 10;
