import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, NotificationType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { PlanRates } from '../pricing/rental-quote.js';
import * as say from './notification-templates.js';
import type { BookingFacts, Message } from './notification-templates.js';
import { NotificationsService } from './notifications.service.js';

const BOOKING_INCLUDE = { station: { include: { city: true } }, vehicle: { select: { code: true } } } as const;
type BookingRow = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

/**
 * Turns things that happen to a booking into messages for its customer. Each method is safe to call twice (the message
 * is sent once) and never throws, so callers can fire it after their own work is saved.
 */
@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /** Payment went through and the booking is confirmed. */
  bookingConfirmed(bookingId: string) {
    return this.raise(bookingId, 'BOOKING_CONFIRMED', 'BOOKING_CONFIRMED', (f, b) =>
      say.bookingConfirmed(f, { total: b.totalAmount, deposit: b.depositAmount }),
    );
  }

  /** `sent` is whether the gateway has taken the refund; a refund that failed is still owed and says so. */
  bookingCancelled(bookingId: string, refund: { amount: number; sent: boolean }) {
    return this.raise(bookingId, 'BOOKING_CANCELLED', 'BOOKING_CANCELLED', (f) => say.bookingCancelled(f, refund));
  }

  /** The 10-minute payment hold ran out. */
  bookingExpired(bookingId: string) {
    return this.raise(bookingId, 'BOOKING_EXPIRED', 'BOOKING_EXPIRED', (f) => say.bookingExpired(f));
  }

  pickupReminder(bookingId: string) {
    return this.raise(bookingId, 'PICKUP_REMINDER', 'PICKUP_REMINDER', (f) => say.pickupReminder(f));
  }

  rideStarted(bookingId: string) {
    return this.raise(bookingId, 'RIDE_STARTED', 'RIDE_STARTED', (f) => say.rideStarted(f));
  }

  returnReminder(bookingId: string) {
    return this.raise(bookingId, 'RETURN_REMINDER', 'RETURN_REMINDER', (f) => say.returnReminder(f));
  }

  returnOverdue(bookingId: string) {
    return this.raise(bookingId, 'RETURN_OVERDUE', 'RETURN_OVERDUE', (f) => say.returnOverdue(f));
  }

  /** The scooter is back: tells the customer what the final bill came to and where the money stands. */
  async rideCompleted(bookingId: string) {
    const bill = await this.settlementOf(bookingId);
    if (!bill) return false;
    return this.raise(bookingId, 'RIDE_COMPLETED', 'RIDE_COMPLETED', (f) => say.rideCompleted(f, bill));
  }

  /** A refund that failed earlier has now gone through. */
  async refundSent(bookingId: string) {
    const bill = await this.settlementOf(bookingId);
    if (!bill) return false;
    return this.raise(bookingId, 'REFUND_SENT', 'REFUND_SENT', (f) => say.refundSent(f, bill.refundAmount));
  }

  /** An amount owed was paid. */
  paymentReceived(bookingId: string, amount: number) {
    return this.raise(bookingId, 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED', (f) => say.paymentReceived(f, amount));
  }

  noShow(bookingId: string, deposit: { amount: number; sent: boolean }) {
    return this.raise(bookingId, 'NO_SHOW', 'NO_SHOW', (f) => say.noShow(f, deposit));
  }

  /**
   * The identity check finished after the customer left the screen (the provider answered later). One message per
   * attempt. Not tied to a booking.
   */
  kycResult(userId: string, result: { status: 'VERIFIED' | 'REJECTED'; attempt: number; reason: string | null; attemptsLeft: number }) {
    const verified = result.status === 'VERIFIED';
    return this.notifications.send({
      userId,
      type: verified ? 'KYC_VERIFIED' : 'KYC_REJECTED',
      bookingId: null,
      dedupeKey: `${verified ? 'KYC_VERIFIED' : 'KYC_REJECTED'}:${userId}:${result.attempt}`,
      message: verified ? say.kycVerified() : say.kycRejected(result.reason, result.attemptsLeft),
    });
  }

  // ---- internals ----

  private async raise(
    bookingId: string,
    type: NotificationType,
    event: string,
    make: (facts: BookingFacts, booking: BookingRow) => Message,
  ): Promise<boolean> {
    try {
      const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
      if (!booking) return false;
      return await this.notifications.send({
        userId: booking.userId,
        type,
        bookingId,
        dedupeKey: `${event}:${bookingId}`,
        message: make(factsOf(booking), booking),
      });
    } catch (e) {
      this.logger.error(`Could not raise ${type} for booking ${bookingId}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  private settlementOf(bookingId: string) {
    return this.prisma.settlement.findUnique({
      where: { bookingId },
      select: { status: true, depositHeld: true, totalCharges: true, refundAmount: true, outstandingAmount: true },
    });
  }
}

function factsOf(b: BookingRow): BookingFacts {
  return {
    code: b.code,
    vehicleCode: b.vehicle.code,
    stationName: b.station.name,
    stationAddress: b.station.address,
    cityName: b.station.city.name,
    timezone: b.station.city.timezone,
    startAt: b.startAt,
    endAt: b.endAt,
    graceMinutes: (b.pricingSnapshot as unknown as PlanRates).graceMinutes,
  };
}
