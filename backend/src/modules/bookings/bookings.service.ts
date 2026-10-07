import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../providers/payment/payment.provider.js';
import { KycService } from '../kyc/kyc.service.js';
import { PricingPlansService, type PricingView } from '../pricing/pricing-plans.service.js';
import { quoteRental, type RentalQuote } from '../pricing/rental-quote.js';
import { toModelView, type VehicleModelView } from '../vehicles/vehicle-models.service.js';
import { liveBookingOverlap, liveBookingWhere } from './booking-availability.js';
import { generateBookingCode } from './booking-codes.js';
import { BOOKING_RULES, cancellationOutcome, isOpenAt, resolveWindow } from './booking-rules.js';
import {
  BOOKING_INCLUDE,
  toBookingView,
  toStationSummary,
  type BookingRow,
  type BookingView,
  type StationSummary,
} from './booking-views.js';
import type { BookingTab, CreateBookingDto, ListBookingsQuery, PayBookingDto, QuoteBookingDto } from './dto/booking.dto.js';

const MINUTE = 60_000;
/** A payment still PENDING after this long is treated as abandoned (a crash between starting and finishing it). */
const STALE_PAYMENT_MS = MINUTE;
const OVERLAP_CONSTRAINT = 'Booking_no_vehicle_overlap';

export interface QuoteView extends RentalQuote {
  vehicle: { id: string; code: string; batteryPercent: number | null; model: VehicleModelView };
  station: StationSummary;
  startAt: Date;
  endAt: Date;
  pricing: PricingView;
  /** How long the scooter is held for payment once booked. */
  holdMinutes: number;
}

interface Prepared {
  quote: QuoteView;
  stationId: string;
  vehicleId: string;
}

@Injectable()
export class BookingsService {
  private readonly pinSecret: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PricingPlansService) private readonly plans: PricingPlansService,
    @Inject(KycService) private readonly kyc: KycService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.pinSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  /** Price and availability of one scooter for a window. Throws the same errors a booking attempt would. */
  async quote(dto: QuoteBookingDto, now = new Date()): Promise<QuoteView> {
    return (await this.prepare(dto, now)).quote;
  }

  /** Holds a scooter for the customer for 10 minutes while they pay. */
  async create(user: AuthUser, dto: CreateBookingDto, now = new Date()): Promise<BookingView> {
    if (!(await this.kyc.isVerified(user.id))) {
      throw new AppException(403, 'KYC_REQUIRED', 'Verify your identity before booking.');
    }
    const prepared = await this.prepare(dto, now);
    const { quote } = prepared;

    // The code is random; on the rare collision, try again with a new one.
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          // Lock the scooter, then the customer, so parallel requests line up (always in this order).
          await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${prepared.vehicleId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
          await tx.booking.updateMany({
            where: {
              OR: [{ vehicleId: prepared.vehicleId }, { userId: user.id }],
              status: 'PENDING_PAYMENT',
              holdExpiresAt: { lte: now },
            },
            data: { status: 'EXPIRED' },
          });

          const fresh = await tx.vehicle.findUnique({
            where: { id: prepared.vehicleId },
            select: { status: true, retiredAt: true, stationId: true },
          });
          if (!fresh || fresh.retiredAt || fresh.status !== 'AVAILABLE' || fresh.stationId !== prepared.stationId) {
            throw new AppException(409, 'VEHICLE_NOT_AVAILABLE', 'This scooter is no longer available.');
          }
          const clash = await tx.booking.count({
            where: { vehicleId: prepared.vehicleId, ...liveBookingOverlap(quote.startAt, quote.endAt, now) },
          });
          if (clash > 0) {
            throw new AppException(409, 'VEHICLE_NOT_AVAILABLE', 'This scooter is booked for that time.');
          }

          const live = await tx.booking.findMany({
            where: { userId: user.id, ...liveBookingWhere(now) },
            select: { startAt: true, endAt: true },
          });
          if (live.length >= BOOKING_RULES.MAX_LIVE_BOOKINGS) {
            throw new AppException(
              409,
              'TOO_MANY_BOOKINGS',
              `You can have up to ${BOOKING_RULES.MAX_LIVE_BOOKINGS} open bookings at a time.`,
            );
          }
          if (live.some((b) => b.startAt < quote.endAt && b.endAt > quote.startAt)) {
            throw new AppException(409, 'OVERLAPPING_BOOKING', 'You already have a booking for that time.');
          }

          return tx.booking.create({
            data: {
              code: generateBookingCode(),
              userId: user.id,
              vehicleId: prepared.vehicleId,
              stationId: prepared.stationId,
              startAt: quote.startAt,
              endAt: quote.endAt,
              hours: quote.hours,
              holdExpiresAt: new Date(now.getTime() + BOOKING_RULES.HOLD_MINUTES * MINUTE),
              rentalAmount: quote.rentalAmount,
              depositAmount: quote.depositAmount,
              totalAmount: quote.totalAmount,
              pricingSnapshot: quote.pricing as unknown as Prisma.InputJsonValue,
            },
            include: BOOKING_INCLUDE,
          });
        });
        return toBookingView(created, this.pinSecret, now);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) continue;
        throw this.mapOverlap(e);
      }
    }
  }

  /**
   * Mock checkout. Safe to retry: the same Idempotency-Key never charges twice, and a booking is only charged once.
   * A failed payment leaves the hold in place so the customer can try again until it runs out.
   */
  async pay(user: AuthUser, id: string, dto: PayBookingDto, idempotencyKey?: string): Promise<BookingView> {
    if (dto.simulate && process.env.NODE_ENV === 'production') {
      throw new AppException(400, 'SIMULATION_DISABLED', 'Simulated outcomes are not available.');
    }
    const now = new Date();

    if (idempotencyKey) {
      const replay = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.bookingId !== id) {
          throw new AppException(409, 'IDEMPOTENCY_KEY_REUSED', 'This key was used for a different booking.');
        }
        await this.ownBooking(user.id, id); // 404 for someone else's booking
        if (replay.status === 'SUCCEEDED') return this.view(user.id, id);
        if (replay.status === 'PENDING') {
          throw new AppException(409, 'PAYMENT_IN_PROGRESS', 'This payment is still being processed.');
        }
        throw new AppException(402, 'PAYMENT_FAILED', replay.failureReason ?? 'The payment did not go through.');
      }
    }

    // Step 1: check the booking and record the attempt. The row lock stops two taps from charging twice.
    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id}::uuid AND "userId" = ${user.id}::uuid FOR UPDATE`;
      const booking = await tx.booking.findFirst({ where: { id, userId: user.id } });
      if (!booking) throw new AppException(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      if (booking.status === 'CONFIRMED') {
        throw new AppException(409, 'ALREADY_PAID', 'This booking is already paid.');
      }
      if (booking.status === 'PENDING_PAYMENT' && booking.holdExpiresAt && booking.holdExpiresAt <= now) {
        await tx.booking.update({ where: { id }, data: { status: 'EXPIRED' } });
        return { expired: true as const };
      }
      if (booking.status === 'EXPIRED') return { expired: true as const };
      if (booking.status !== 'PENDING_PAYMENT') {
        throw new AppException(409, 'BOOKING_NOT_PAYABLE', 'This booking can no longer be paid.');
      }
      const inFlight = await tx.payment.count({
        where: {
          bookingId: id,
          status: 'PENDING',
          createdAt: { gt: new Date(now.getTime() - STALE_PAYMENT_MS) },
        },
      });
      if (inFlight > 0) throw new AppException(409, 'PAYMENT_IN_PROGRESS', 'A payment is already being processed.');

      const payment = await tx.payment.create({
        data: {
          bookingId: id,
          purpose: 'RENTAL_AND_DEPOSIT',
          chargeAmount: booking.totalAmount,
          provider: this.payments.name,
          idempotencyKey: idempotencyKey ?? null,
        },
      });
      return { expired: false as const, payment, code: booking.code };
    });

    if (attempt.expired) {
      throw new AppException(409, 'HOLD_EXPIRED', 'Your hold on this scooter ran out. Book it again.');
    }
    const { payment, code } = attempt;

    // Step 2: ask the gateway (outside the transaction: it can be slow).
    const charge = await this.payments.charge({
      amount: payment.chargeAmount,
      reference: code,
      idempotencyKey: payment.id,
      simulate: dto.simulate,
    });
    if (!charge.ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: charge.reason },
      });
      throw new AppException(402, 'PAYMENT_FAILED', charge.reason, { bookingId: id });
    }

    // Step 3: confirm the booking, unless the hold ran out while we were charging (then give the money back).
    const confirmedAt = new Date();
    const confirmed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id}::uuid FOR UPDATE`;
      const done = await tx.booking.updateMany({
        where: { id, status: 'PENDING_PAYMENT', holdExpiresAt: { gt: confirmedAt } },
        data: { status: 'CONFIRMED', confirmedAt, holdExpiresAt: null },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED', providerRef: charge.providerRef, paidAt: confirmedAt },
      });
      return done.count === 1;
    });
    if (!confirmed) {
      await this.refund(payment.id, payment.chargeAmount, charge.providerRef, 'CANCELLATION');
      await this.prisma.booking.updateMany({
        where: { id, status: 'PENDING_PAYMENT' },
        data: { status: 'EXPIRED' },
      });
      throw new AppException(
        409,
        'HOLD_EXPIRED',
        'Your hold on this scooter ran out, so your payment was refunded. Book it again.',
      );
    }
    return this.view(user.id, id);
  }

  async list(user: AuthUser, query: ListBookingsQuery, now = new Date()): Promise<Page<BookingView>> {
    await this.expireHolds(user.id, now);
    const where: Prisma.BookingWhereInput = { userId: user.id, ...(query.tab && tabFilter(query.tab, now)) };
    const { page, limit, skip, take } = pageArgs(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: BOOKING_INCLUDE,
        orderBy: query.tab === 'past' || !query.tab ? { startAt: 'desc' } : { startAt: 'asc' },
        skip,
        take,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: rows.map((r) => toBookingView(r, this.pinSecret, now)), total, page, limit };
  }

  async get(user: AuthUser, id: string): Promise<BookingView> {
    await this.expireHolds(user.id, new Date());
    return this.view(user.id, id);
  }

  /** Cancels a booking and sends back whatever the rules allow (see cancellationOutcome). */
  async cancel(user: AuthUser, id: string): Promise<BookingView> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id}::uuid AND "userId" = ${user.id}::uuid FOR UPDATE`;
      let booking = await tx.booking.findFirst({ where: { id, userId: user.id } });
      if (!booking) throw new AppException(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      if (booking.status === 'PENDING_PAYMENT' && booking.holdExpiresAt && booking.holdExpiresAt <= now) {
        booking = await tx.booking.update({ where: { id }, data: { status: 'EXPIRED' } });
      }
      const outcome = cancellationOutcome(booking, now);
      if (!outcome.allowed) throw new AppException(409, 'CANNOT_CANCEL', cannotCancelMessage(booking.status));

      await tx.booking.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: now, holdExpiresAt: null },
      });
      const paid = await tx.payment.findFirst({
        where: { bookingId: id, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
      });
      return { outcome, paid };
    });

    if (result.outcome.refundAmount > 0 && result.paid) {
      await this.refund(result.paid.id, result.outcome.refundAmount, result.paid.providerRef, 'CANCELLATION');
    }
    return this.view(user.id, id);
  }

  // ---- internals ----

  /** Everything needed to price a booking, and every rule that can say no. Does not write anything. */
  private async prepare(dto: QuoteBookingDto, now: Date): Promise<Prepared> {
    const window = resolveWindow(dto.startAt ? new Date(dto.startAt) : undefined, dto.hours, now);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, retiredAt: null },
      include: { model: true, station: { include: { city: true } } },
    });
    const station = vehicle?.station;
    if (!vehicle || !station || station.status !== 'ACTIVE' || !station.city.isActive || !vehicle.model.isActive) {
      throw new AppException(404, 'VEHICLE_NOT_FOUND', 'Scooter not found.');
    }
    if (vehicle.status !== 'AVAILABLE') {
      throw new AppException(409, 'VEHICLE_NOT_AVAILABLE', 'This scooter is not available to rent.');
    }
    if (!isOpenAt(window.startAt, station.opensAt, station.closesAt, station.city.timezone)) {
      throw new AppException(
        409,
        'STATION_CLOSED',
        `${station.name} is closed at that time. It is open ${station.opensAt} to ${station.closesAt}.`,
      );
    }
    const pricing = (await this.plans.resolveForModels(station.cityId, [vehicle.modelId])).get(vehicle.modelId);
    if (!pricing) throw new AppException(409, 'NO_PRICING_PLAN', 'This scooter cannot be booked yet.');

    const clash = await this.prisma.booking.count({
      where: { vehicleId: vehicle.id, ...liveBookingOverlap(window.startAt, window.endAt, now) },
    });
    if (clash > 0) throw new AppException(409, 'VEHICLE_NOT_AVAILABLE', 'This scooter is booked for that time.');

    return {
      vehicleId: vehicle.id,
      stationId: station.id,
      quote: {
        ...quoteRental(pricing, dto.hours),
        vehicle: {
          id: vehicle.id,
          code: vehicle.code,
          batteryPercent: vehicle.batteryPercent,
          model: toModelView(vehicle.model),
        },
        station: toStationSummary(station),
        startAt: window.startAt,
        endAt: window.endAt,
        pricing,
        holdMinutes: BOOKING_RULES.HOLD_MINUTES,
      },
    };
  }

  private async ownBooking(userId: string, id: string): Promise<BookingRow> {
    const booking = await this.prisma.booking.findFirst({ where: { id, userId }, include: BOOKING_INCLUDE });
    if (!booking) throw new AppException(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    return booking;
  }

  private async view(userId: string, id: string): Promise<BookingView> {
    return toBookingView(await this.ownBooking(userId, id), this.pinSecret, new Date());
  }

  /** Marks this customer's runaway payment holds EXPIRED so lists and details never show them as live. */
  private async expireHolds(userId: string, now: Date) {
    await this.prisma.booking.updateMany({
      where: { userId, status: 'PENDING_PAYMENT', holdExpiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
  }

  private async refund(paymentId: string, amount: number, providerRef: string | null, reason: 'CANCELLATION') {
    const result = providerRef
      ? await this.payments.refund({ providerRef, amount, idempotencyKey: `refund-${paymentId}-${reason}` })
      : ({ ok: false, reason: 'The payment has no gateway reference.' } as const);
    await this.prisma.refund.create({
      data: {
        paymentId,
        refundAmount: amount,
        status: result.ok ? 'SUCCEEDED' : 'FAILED',
        reason,
        provider: this.payments.name,
        providerRef: result.ok ? result.providerRef : null,
      },
    });
  }

  private mapOverlap(e: unknown): unknown {
    // The row lock above makes this unreachable in practice; the database constraint is the last line of defence.
    if (e instanceof Error && e.message.includes(OVERLAP_CONSTRAINT)) {
      return new AppException(409, 'VEHICLE_NOT_AVAILABLE', 'This scooter is booked for that time.');
    }
    return e;
  }
}

function tabFilter(tab: BookingTab, now: Date): Prisma.BookingWhereInput {
  switch (tab) {
    case 'active':
      return {
        OR: [
          { status: 'PENDING_PAYMENT' },
          { status: 'IN_RIDE' },
          { status: 'CONFIRMED', startAt: { lte: now } },
        ],
      };
    case 'upcoming':
      return { status: 'CONFIRMED', startAt: { gt: now } };
    case 'past':
      return { status: { in: ['RETURNED', 'SETTLED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'] } };
  }
}

function cannotCancelMessage(status: BookingRow['status']): string {
  switch (status) {
    case 'CANCELLED':
      return 'This booking is already cancelled.';
    case 'EXPIRED':
      return 'This booking has expired.';
    case 'CONFIRMED':
      return 'This booking has ended and can no longer be cancelled.';
    default:
      return 'This booking can no longer be cancelled.';
  }
}
