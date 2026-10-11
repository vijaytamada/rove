import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { formatRupees } from '../../common/money.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { ScopeService } from '../rbac/scope.service.js';
import type { PlanRates } from '../pricing/rental-quote.js';
import { calculateFinalCharges } from '../pricing/settlement-charges.js';
import type { ListSettlementsQuery, PayOutstandingDto } from './dto/settlement.dto.js';
import { SETTLEMENT_INCLUDE, toSettlementView, type SettlementRow, type SettlementView } from './settlement-views.js';

const MINUTE = 60_000;
/** A payment still PENDING after this long is treated as abandoned (a crash between starting and finishing it). */
const STALE_PAYMENT_MS = MINUTE;

/** The ride as staff recorded it, passed in by the step that takes the scooter back. */
export interface RideToSettle {
  bookingId: string;
  hours: number;
  bookedEndAt: Date;
  returnedAt: Date;
  distanceKm: number;
  pricingSnapshot: unknown;
  /** Damage found at return. Damage that was already there is not passed in. */
  damages: { description: string; feeAmount: number }[];
}

/** A settlement together with the booking it belongs to, as station staff see it. */
export interface StaffSettlementView extends SettlementView {
  booking: {
    id: string;
    code: string;
    status: string;
    customer: { id: string; fullName: string; phone: string | null };
    vehicleCode: string;
    stationName: string;
    /** IANA time zone of the station's city, for showing times. */
    timezone: string;
    returnStationName: string | null;
    returnedAt: Date | null;
  };
}

const STAFF_INCLUDE = {
  ...SETTLEMENT_INCLUDE,
  booking: {
    include: {
      user: { select: { id: true, fullName: true, phone: true } },
      vehicle: { select: { code: true } },
      station: { include: { city: true } },
      rental: { include: { returnStation: true } },
    },
  },
} as const;
type StaffSettlementRow = Prisma.SettlementGetPayload<{ include: typeof STAFF_INCLUDE }>;

interface StationAccess {
  where: Prisma.StationWhereInput;
  matches: (s: { id: string; cityId: string }) => boolean;
}

/**
 * The final bill of a ride: charges taken from the deposit, then a refund or an amount the customer owes.
 * The numbers come from the pure engine in `pricing/settlement-charges.ts`; this class stores them and moves the money.
 */
@Injectable()
export class SettlementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(NotificationEventsService) private readonly events: NotificationEventsService,
  ) {}

  // ---- creating (called by the step that takes the scooter back) ----

  /**
   * Works out and stores the bill inside the caller's transaction, so a ride is never returned without one.
   * A refund is only queued here (`REFUND_PENDING`); call `finishRefund` after the transaction commits.
   * Nothing to refund means the booking is settled straight away.
   */
  async createInTx(tx: Prisma.TransactionClient, ride: RideToSettle): Promise<{ settlementId: string; needsRefund: boolean }> {
    const result = calculateFinalCharges(ride.pricingSnapshot as PlanRates, {
      hours: ride.hours,
      bookedEndAt: ride.bookedEndAt,
      returnedAt: ride.returnedAt,
      distanceKm: ride.distanceKm,
      damages: ride.damages,
    });
    const status = result.outcome === 'REFUND' ? 'REFUND_PENDING' : result.outcome === 'OUTSTANDING' ? 'OUTSTANDING' : 'NO_ACTION';
    const settlement = await tx.settlement.create({
      data: {
        bookingId: ride.bookingId,
        depositHeld: result.depositHeld,
        totalCharges: result.totalCharges,
        refundAmount: result.refundAmount,
        outstandingAmount: result.outstandingAmount,
        status,
        settledAt: status === 'NO_ACTION' ? ride.returnedAt : null,
        lineItems: { create: result.lines.map((l) => ({ ...l })) },
      },
    });
    // With nothing to refund the money side is done; an amount owed is tracked on the settlement itself.
    if (status !== 'REFUND_PENDING') {
      await tx.booking.update({ where: { id: ride.bookingId }, data: { status: 'SETTLED' } });
    }
    return { settlementId: settlement.id, needsRefund: status === 'REFUND_PENDING' };
  }

  /**
   * Sends the rest of the deposit back and marks the settlement and booking done. If the gateway says no it stays
   * `REFUND_PENDING` for staff to retry. Safe to call again: a refund that already went through is never repeated.
   */
  async finishRefund(settlementId: string): Promise<boolean> {
    const s = await this.prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!s || s.status !== 'REFUND_PENDING') return s?.status === 'REFUNDED';

    const paid = await this.prisma.payment.findFirst({
      where: { bookingId: s.bookingId, purpose: 'RENTAL_AND_DEPOSIT', status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
      include: { refunds: true },
    });
    if (!paid) return false;

    let ok = paid.refunds.some((r) => r.reason === 'DEPOSIT_RETURN' && r.status === 'SUCCEEDED');
    if (!ok) {
      const attempt = paid.refunds.filter((r) => r.reason === 'DEPOSIT_RETURN').length + 1;
      try {
        ok = await this.payments.refund(paid.id, s.refundAmount, paid.providerRef, 'DEPOSIT_RETURN', attempt);
      } catch (e) {
        // The database allows one successful deposit refund per payment: a parallel call got there first.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') ok = true;
        else throw e;
      }
    }
    if (!ok) return false;

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.settlement.updateMany({ where: { id: s.id, status: 'REFUND_PENDING' }, data: { status: 'REFUNDED', settledAt: now } });
      await tx.booking.updateMany({ where: { id: s.bookingId, status: 'RETURNED' }, data: { status: 'SETTLED' } });
    });
    return true;
  }

  // ---- customers ----

  /** The customer's own settlement for a booking. 404 for anyone else's, and for a ride that has no bill yet. */
  async forCustomer(user: AuthUser, bookingId: string): Promise<SettlementView> {
    const s = await this.prisma.settlement.findFirst({
      where: { bookingId, booking: { is: { userId: user.id } } },
      relationLoadStrategy: 'join',
      include: SETTLEMENT_INCLUDE,
    });
    if (!s) throw new AppException(404, 'SETTLEMENT_NOT_FOUND', 'There is no final bill for this booking yet.');
    return toSettlementView(s);
  }

  /** A customer who owes money for an earlier ride cannot start a new booking until it is paid. */
  async assertNoOutstanding(userId: string): Promise<void> {
    const owed = await this.prisma.settlement.findFirst({
      where: { status: 'OUTSTANDING', booking: { is: { userId } } },
      select: { outstandingAmount: true, bookingId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (owed) {
      throw new AppException(
        409,
        'OUTSTANDING_BALANCE',
        `You owe ${formatRupees(owed.outstandingAmount)} for your last ride. Pay it to book again.`,
        { bookingId: owed.bookingId, amount: owed.outstandingAmount },
      );
    }
  }

  /** Mock card payment of the amount a customer owes. */
  async payOutstanding(user: AuthUser, bookingId: string, dto: PayOutstandingDto, idempotencyKey?: string): Promise<SettlementView> {
    const s = await this.prisma.settlement.findFirst({ where: { bookingId, booking: { is: { userId: user.id } } } });
    if (!s) throw new AppException(404, 'SETTLEMENT_NOT_FOUND', 'There is no final bill for this booking yet.');
    return this.collect(s.id, dto, idempotencyKey, { ownerId: user.id });
  }

  // ---- staff ----

  async list(user: AuthUser, query: ListSettlementsQuery): Promise<Page<StaffSettlementView>> {
    const access = await this.stationAccess(user);
    if (query.stationId) await this.scopes.assertStationIdAccess(user, query.stationId);
    const stationFilter: Prisma.StationWhereInput = { AND: [access.where, ...(query.stationId ? [{ id: query.stationId }] : [])] };
    const where: Prisma.SettlementWhereInput = {
      status: query.status ?? { in: ['OUTSTANDING', 'REFUND_PENDING'] },
      booking: { is: { OR: [{ station: { is: stationFilter } }, { rental: { is: { returnStation: { is: stationFilter } } } }] } },
    };
    const { page, limit, skip, take } = pageArgs(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.settlement.findMany({ where, relationLoadStrategy: 'join', include: STAFF_INCLUDE, orderBy: { createdAt: 'asc' }, skip, take }),
      this.prisma.settlement.count({ where }),
    ]);
    return { items: rows.map(toStaffView), total, page, limit };
  }

  /** Staff take the payment of an outstanding amount at the desk (mock card/cash). */
  async collectAtDesk(user: AuthUser, settlementId: string, dto: PayOutstandingDto, idempotencyKey?: string): Promise<StaffSettlementView> {
    await this.loadForStaff(user, settlementId);
    await this.collect(settlementId, dto, idempotencyKey, {});
    return this.staffView(user, settlementId);
  }

  /** Tries the deposit refund again after a failure. */
  async retryRefund(user: AuthUser, settlementId: string): Promise<StaffSettlementView> {
    const s = await this.loadForStaff(user, settlementId);
    if (s.status !== 'REFUND_PENDING') {
      throw new AppException(409, 'NOTHING_TO_RETRY', 'This settlement has no refund waiting to go through.');
    }
    const ok = await this.finishRefund(settlementId);
    if (!ok) throw new AppException(502, 'REFUND_FAILED', 'The refund did not go through. Try again in a moment.');
    await this.events.refundSent(s.bookingId);
    return this.staffView(user, settlementId);
  }

  async staffView(user: AuthUser, settlementId: string): Promise<StaffSettlementView> {
    return toStaffView(await this.loadForStaff(user, settlementId));
  }

  // ---- internals ----

  /** Charges the customer's outstanding amount once; `ownerId` restricts it to that customer's own booking. */
  private async collect(
    settlementId: string,
    dto: PayOutstandingDto,
    idempotencyKey: string | undefined,
    who: { ownerId?: string },
  ): Promise<SettlementView> {
    if (dto.simulate && process.env.NODE_ENV === 'production') {
      throw new AppException(400, 'SIMULATION_DISABLED', 'Simulated outcomes are not available.');
    }
    const now = new Date();

    if (idempotencyKey) {
      const replay = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
      if (replay) {
        const s = await this.prisma.settlement.findUnique({ where: { id: settlementId }, relationLoadStrategy: 'join', include: SETTLEMENT_INCLUDE });
        if (!s || replay.bookingId !== s.bookingId || replay.purpose !== 'OUTSTANDING') {
          throw new AppException(409, 'IDEMPOTENCY_KEY_REUSED', 'This key was used for a different payment.');
        }
        if (replay.status === 'SUCCEEDED') return toSettlementView(s);
        if (replay.status === 'PENDING') throw new AppException(409, 'PAYMENT_IN_PROGRESS', 'This payment is still being processed.');
        throw new AppException(402, 'PAYMENT_FAILED', replay.failureReason ?? 'The payment did not go through.');
      }
    }

    // Step 1: check the bill and record the attempt. The row lock stops two taps from charging twice.
    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Settlement" WHERE id = ${settlementId}::uuid FOR UPDATE`;
      const s = await tx.settlement.findUnique({ where: { id: settlementId }, include: { booking: true } });
      if (!s || (who.ownerId && s.booking.userId !== who.ownerId)) {
        throw new AppException(404, 'SETTLEMENT_NOT_FOUND', 'There is no final bill for this booking yet.');
      }
      if (s.status === 'CLEARED') throw new AppException(409, 'ALREADY_PAID', 'This amount has already been paid.');
      if (s.status !== 'OUTSTANDING') throw new AppException(409, 'NOTHING_TO_PAY', 'There is nothing to pay for this ride.');
      const inFlight = await tx.payment.count({
        where: {
          bookingId: s.bookingId,
          purpose: 'OUTSTANDING',
          status: 'PENDING',
          createdAt: { gt: new Date(now.getTime() - STALE_PAYMENT_MS) },
        },
      });
      if (inFlight > 0) throw new AppException(409, 'PAYMENT_IN_PROGRESS', 'A payment is already being processed.');
      const payment = await tx.payment.create({
        data: {
          bookingId: s.bookingId,
          purpose: 'OUTSTANDING',
          chargeAmount: s.outstandingAmount,
          provider: this.payments.providerName,
          idempotencyKey: idempotencyKey ?? null,
        },
      });
      return { payment, code: s.booking.code };
    });

    // Step 2: ask the gateway (outside the transaction: it can be slow).
    const { payment, code } = attempt;
    const charge = await this.payments.charge({
      amount: payment.chargeAmount,
      reference: code,
      idempotencyKey: payment.id,
      simulate: dto.simulate,
    });
    if (!charge.ok) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: charge.reason } });
      throw new AppException(402, 'PAYMENT_FAILED', charge.reason, { settlementId });
    }

    // Step 3: record the payment and clear the amount.
    const paidAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', providerRef: charge.providerRef, paidAt } });
      await tx.settlement.updateMany({ where: { id: settlementId, status: 'OUTSTANDING' }, data: { status: 'CLEARED', clearedAt: paidAt } });
    });
    const done = await this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId }, relationLoadStrategy: 'join', include: SETTLEMENT_INCLUDE });
    await this.events.paymentReceived(done.bookingId, payment.chargeAmount);
    return toSettlementView(done);
  }

  private async loadForStaff(user: AuthUser, id: string): Promise<StaffSettlementRow> {
    const row = await this.prisma.settlement.findUnique({ where: { id }, relationLoadStrategy: 'join', include: STAFF_INCLUDE });
    const access = await this.stationAccess(user);
    const stations = row ? [row.booking.station, ...(row.booking.rental?.returnStation ? [row.booking.rental.returnStation] : [])] : [];
    // Not found rather than forbidden: staff of other stations cannot tell the bill exists.
    if (!row || !stations.some((s) => access.matches(s))) {
      throw new AppException(404, 'SETTLEMENT_NOT_FOUND', 'Settlement not found.');
    }
    return row;
  }

  /** The stations a staff member works at: where the ride started or where the scooter came back. */
  private async stationAccess(user: AuthUser): Promise<StationAccess> {
    const scope = await this.scopes.getScope(user);
    if (scope.unrestricted) return { where: {}, matches: () => true };
    if (user.role === 'CITY_MANAGER') {
      const cities = new Set(scope.cityIds);
      return { where: { cityId: { in: scope.cityIds } }, matches: (s) => cities.has(s.cityId) };
    }
    const stations = new Set(scope.stationIds);
    return { where: { id: { in: scope.stationIds } }, matches: (s) => stations.has(s.id) };
  }
}

function toStaffView(row: StaffSettlementRow): StaffSettlementView {
  const b = row.booking;
  return {
    ...toSettlementView(row as SettlementRow),
    booking: {
      id: b.id,
      code: b.code,
      status: b.status,
      customer: { id: b.user.id, fullName: b.user.fullName, phone: b.user.phone },
      vehicleCode: b.vehicle.code,
      stationName: b.station.name,
      timezone: b.station.city.timezone,
      returnStationName: b.rental?.returnStation?.name ?? null,
      returnedAt: b.rental?.endedAt ?? null,
    },
  };
}
