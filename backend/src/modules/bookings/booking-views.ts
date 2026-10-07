import type {
  Booking,
  City,
  Payment,
  PaymentStatus,
  Refund,
  Station,
  Vehicle,
  VehicleModel,
} from '../../generated/prisma/client.js';
import type { PlanRates } from '../pricing/rental-quote.js';
import { toModelView, type VehicleModelView } from '../vehicles/vehicle-models.service.js';
import { derivePin } from './booking-codes.js';
import { cancellationOutcome, type CancellationOutcome } from './booking-rules.js';

export interface StationSummary {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  opensAt: string | null;
  closesAt: string | null;
  cityName: string;
  /** IANA time zone of the city. Clients show times on the device clock. */
  timezone: string;
}

export interface BookingView {
  id: string;
  code: string;
  status: Booking['status'];
  startAt: Date;
  endAt: Date;
  hours: number;
  /** Set while the vehicle is held for payment. */
  holdExpiresAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  rentalAmount: number;
  /** Refundable. Always shown as its own line. */
  depositAmount: number;
  totalAmount: number;
  /** The rates the customer agreed to. */
  pricing: PlanRates & { planId: string };
  includedKm: number;
  /** Pickup PIN. Only while the booking is confirmed or in progress. */
  pin: string | null;
  vehicle: { id: string; code: string; model: VehicleModelView };
  station: StationSummary;
  payment: { status: PaymentStatus; chargeAmount: number; paidAt: Date | null } | null;
  /** Money already returned to the customer. */
  refundedAmount: number;
  /** What cancelling right now would do, so the client never works it out itself. */
  cancellation: CancellationOutcome;
}

export type BookingRow = Booking & {
  vehicle: Vehicle & { model: VehicleModel };
  station: Station & { city: City };
  payments: (Payment & { refunds: Refund[] })[];
};

export const BOOKING_INCLUDE = {
  vehicle: { include: { model: true } },
  station: { include: { city: true } },
  payments: { include: { refunds: true }, orderBy: { createdAt: 'desc' as const } },
} as const;

export const toStationSummary = (s: Station & { city: City }): StationSummary => ({
  id: s.id,
  name: s.name,
  address: s.address,
  latitude: s.latitude,
  longitude: s.longitude,
  opensAt: s.opensAt,
  closesAt: s.closesAt,
  cityName: s.city.name,
  timezone: s.city.timezone,
});

export function toBookingView(b: BookingRow, pinSecret: string, now: Date): BookingView {
  const snapshot = b.pricingSnapshot as unknown as PlanRates & { planId: string };
  const latest = b.payments[0] ?? null;
  const refundedAmount = b.payments
    .flatMap((p) => p.refunds)
    .filter((r) => r.status === 'SUCCEEDED')
    .reduce((sum, r) => sum + r.refundAmount, 0);

  return {
    id: b.id,
    code: b.code,
    status: b.status,
    startAt: b.startAt,
    endAt: b.endAt,
    hours: b.hours,
    holdExpiresAt: b.status === 'PENDING_PAYMENT' ? b.holdExpiresAt : null,
    confirmedAt: b.confirmedAt,
    cancelledAt: b.cancelledAt,
    createdAt: b.createdAt,
    rentalAmount: b.rentalAmount,
    depositAmount: b.depositAmount,
    totalAmount: b.totalAmount,
    pricing: snapshot,
    includedKm: snapshot.includedKmPerHour * b.hours,
    pin: b.status === 'CONFIRMED' || b.status === 'IN_RIDE' ? derivePin(pinSecret, b.id) : null,
    vehicle: { id: b.vehicle.id, code: b.vehicle.code, model: toModelView(b.vehicle.model) },
    station: toStationSummary(b.station),
    payment: latest ? { status: latest.status, chargeAmount: latest.chargeAmount, paidAt: latest.paidAt } : null,
    refundedAmount,
    cancellation: cancellationOutcome(b, now),
  };
}
