import type {
  Booking,
  City,
  DamageRecord,
  Payment,
  Refund,
  Rental,
  Station,
  User,
  Vehicle,
  VehicleModel,
} from '../../generated/prisma/client.js';
import { toStationSummary, type StationSummary } from '../bookings/booking-views.js';
import { toModelView, type VehicleModelView } from '../vehicles/vehicle-models.service.js';
import { distanceKm, noShowFrom, pickupOpensAt, type Allowed } from './rental-rules.js';

export interface DamageView {
  id: string;
  phase: 'PICKUP' | 'RETURN';
  description: string;
  severity: 'MINOR' | 'MODERATE' | 'MAJOR';
  feeAmount: number;
}

export interface RentalView {
  startedAt: Date;
  endedAt: Date | null;
  startOdometerKm: number;
  endOdometerKm: number | null;
  distanceKm: number | null;
  startBatteryPercent: number;
  endBatteryPercent: number | null;
  pickupEmployee: string;
  returnEmployee: string | null;
  returnStation: { id: string; name: string } | null;
  swapReason: string | null;
  damages: DamageView[];
}

/** What the station sees of a booking. The pickup PIN is never part of it: staff ask the customer. */
export interface StaffBookingView {
  id: string;
  code: string;
  status: Booking['status'];
  startAt: Date;
  endAt: Date;
  hours: number;
  createdAt: Date;
  rentalAmount: number;
  depositAmount: number;
  totalAmount: number;
  /** Money already returned to the customer (deposit refunds, cancellations, no-shows). */
  refundedAmount: number;
  customer: { id: string; fullName: string; phone: string | null };
  vehicle: {
    id: string;
    code: string;
    model: VehicleModelView;
    odometerKm: number;
    batteryPercent: number | null;
    status: Vehicle['status'];
  };
  station: StationSummary;
  rental: RentalView | null;
  pickupOpensAt: Date;
  noShowFrom: Date;
  actions: { pickup: Allowed; return: Allowed; noShow: Allowed };
  /** Stations this user can return the scooter to (same city). Only while the scooter is out. */
  returnStations: { id: string; name: string }[];
  /** Other scooters of the same model that can be handed over instead. Only while pickup is possible. */
  swapOptions: { id: string; code: string; batteryPercent: number | null }[];
}

export type RentalRow = Rental & {
  returnStation: Station | null;
  pickupEmployee: Pick<User, 'fullName'>;
  returnEmployee: Pick<User, 'fullName'> | null;
  damages: DamageRecord[];
};

export type StaffBookingRow = Booking & {
  payments: (Payment & { refunds: Refund[] })[];
  user: Pick<User, 'id' | 'fullName' | 'phone'>;
  vehicle: Vehicle & { model: VehicleModel };
  station: Station & { city: City };
  rental: RentalRow | null;
};

export const STAFF_BOOKING_INCLUDE = {
  user: { select: { id: true, fullName: true, phone: true } },
  vehicle: { include: { model: true } },
  station: { include: { city: true } },
  payments: { include: { refunds: true } },
  rental: {
    include: {
      returnStation: true,
      pickupEmployee: { select: { fullName: true } },
      returnEmployee: { select: { fullName: true } },
      damages: { orderBy: { createdAt: 'asc' as const } },
    },
  },
} as const;

export const toRentalView = (r: RentalRow): RentalView => ({
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  startOdometerKm: r.startOdometerKm,
  endOdometerKm: r.endOdometerKm,
  distanceKm: r.endOdometerKm === null ? null : distanceKm(r.startOdometerKm, r.endOdometerKm),
  startBatteryPercent: r.startBatteryPercent,
  endBatteryPercent: r.endBatteryPercent,
  pickupEmployee: r.pickupEmployee.fullName,
  returnEmployee: r.returnEmployee?.fullName ?? null,
  returnStation: r.returnStation ? { id: r.returnStation.id, name: r.returnStation.name } : null,
  swapReason: r.swapReason,
  damages: r.damages.map((d) => ({
    id: d.id,
    phase: d.phase,
    description: d.description,
    severity: d.severity,
    feeAmount: d.feeAmount,
  })),
});

export function toStaffBookingView(
  b: StaffBookingRow,
  extras: {
    actions: StaffBookingView['actions'];
    returnStations: StaffBookingView['returnStations'];
    swapOptions: StaffBookingView['swapOptions'];
  },
): StaffBookingView {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    startAt: b.startAt,
    endAt: b.endAt,
    hours: b.hours,
    createdAt: b.createdAt,
    rentalAmount: b.rentalAmount,
    depositAmount: b.depositAmount,
    totalAmount: b.totalAmount,
    refundedAmount: b.payments
      .flatMap((p) => p.refunds)
      .filter((r) => r.status === 'SUCCEEDED')
      .reduce((sum, r) => sum + r.refundAmount, 0),
    customer: { id: b.user.id, fullName: b.user.fullName, phone: b.user.phone },
    vehicle: {
      id: b.vehicle.id,
      code: b.vehicle.code,
      model: toModelView(b.vehicle.model),
      odometerKm: b.vehicle.odometerKm,
      batteryPercent: b.vehicle.batteryPercent,
      status: b.vehicle.status,
    },
    station: toStationSummary(b.station),
    rental: b.rental ? toRentalView(b.rental) : null,
    pickupOpensAt: pickupOpensAt(b),
    noShowFrom: noShowFrom(b),
    ...extras,
  };
}
