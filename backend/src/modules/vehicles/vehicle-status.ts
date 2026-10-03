import { AppException } from '../../common/app-exception.js';
import type { Role, VehicleStatus } from '../../generated/prisma/client.js';

/** Statuses a person may set by hand. RESERVED and IN_RIDE are controlled by bookings/rentals (Phases 4-5). */
export const MANUAL_STATUSES: VehicleStatus[] = ['AVAILABLE', 'MAINTENANCE', 'OFFLINE'];

/** Vehicles in these states belong to a booking/ride and must not be changed by hand. */
export const BUSY_STATUSES: VehicleStatus[] = ['RESERVED', 'IN_RIDE'];

/**
 * Validates a manual status change.
 * - busy vehicles cannot be changed (409)
 * - only AVAILABLE / MAINTENANCE / OFFLINE can be set (400)
 * - station employees may only flag a vehicle for MAINTENANCE (403); managers/admins decide the rest
 */
export function assertManualStatusChange(role: Role, from: VehicleStatus, to: VehicleStatus): void {
  if (BUSY_STATUSES.includes(from)) {
    throw new AppException(409, 'VEHICLE_BUSY', 'This vehicle is part of a booking or ride and cannot be changed.');
  }
  if (!MANUAL_STATUSES.includes(to)) {
    throw new AppException(400, 'INVALID_STATUS_CHANGE', 'That status is set automatically by bookings and rides.');
  }
  if (role === 'STATION_EMPLOYEE' && to !== 'MAINTENANCE') {
    throw new AppException(403, 'FORBIDDEN_ROLE', 'Station employees can only flag a vehicle for maintenance.');
  }
}
