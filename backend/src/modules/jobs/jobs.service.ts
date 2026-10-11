import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import type { PlanRates } from '../pricing/rental-quote.js';
import { REMINDER_RULES, pickupReminderDue, returnOverdueDue, returnReminderDue } from './reminder-rules.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Most rows one step handles per run; the rest wait for the next minute. */
const BATCH = 200;

export interface JobCounts {
  holdsExpired: number;
  holdNotices: number;
  pickupReminders: number;
  returnReminders: number;
  overdueNotices: number;
  telemetryPruned: number;
}

/**
 * The work done every minute: unpaid holds that ran out are marked expired, and reminders that came due are sent. Every
 * step is safe to repeat (a booking is only expired once, a message only sent once), so two runs can never double up.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationEventsService) private readonly events: NotificationEventsService,
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {}

  async runOnce(now = new Date()): Promise<JobCounts> {
    const counts: JobCounts = { holdsExpired: 0, holdNotices: 0, pickupReminders: 0, returnReminders: 0, overdueNotices: 0, telemetryPruned: 0 };
    // A failing step must not stop the others.
    await this.step('expire holds', async () => {
      counts.holdsExpired = await this.expireHolds(now);
      counts.holdNotices = await this.noticeExpiredHolds(now);
    });
    await this.step('pickup reminders', async () => (counts.pickupReminders = await this.pickupReminders(now)));
    await this.step('return reminders', async () => (counts.returnReminders = await this.returnReminders(now)));
    await this.step('overdue notices', async () => (counts.overdueNotices = await this.overdueNotices(now)));
    await this.step('prune telemetry', async () => (counts.telemetryPruned = await this.telemetry.prune(now)));
    return counts;
  }

  /** Bookings still waiting for payment after their 10-minute hold become EXPIRED, which frees the scooter in every list. */
  async expireHolds(now: Date): Promise<number> {
    const done = await this.prisma.booking.updateMany({
      where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return done.count;
  }

  /** Tells customers about recent expired holds, including ones another request marked expired first. */
  private async noticeExpiredHolds(now: Date): Promise<number> {
    const rows = await this.prisma.booking.findMany({
      where: {
        status: 'EXPIRED',
        updatedAt: { gt: new Date(now.getTime() - REMINDER_RULES.HOLD_NOTICE_MAX_AGE_HOURS * HOUR) },
        notifications: { none: { type: 'BOOKING_EXPIRED' } },
      },
      select: { id: true },
      take: BATCH,
    });
    return this.count(rows, (r) => this.events.bookingExpired(r.id));
  }

  private async pickupReminders(now: Date): Promise<number> {
    const rows = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        startAt: { gt: now, lte: new Date(now.getTime() + REMINDER_RULES.PICKUP_LEAD_MINUTES * MINUTE) },
        notifications: { none: { type: 'PICKUP_REMINDER' } },
      },
      select: { id: true, status: true, startAt: true, confirmedAt: true },
      take: BATCH,
    });
    return this.count(
      rows.filter((r) => pickupReminderDue(r, now)),
      (r) => this.events.pickupReminder(r.id),
    );
  }

  private async returnReminders(now: Date): Promise<number> {
    const rows = await this.prisma.booking.findMany({
      where: {
        status: 'IN_RIDE',
        endAt: { gt: now, lte: new Date(now.getTime() + REMINDER_RULES.RETURN_LEAD_MINUTES * MINUTE) },
        notifications: { none: { type: 'RETURN_REMINDER' } },
      },
      select: { id: true, status: true, endAt: true },
      take: BATCH,
    });
    return this.count(
      rows.filter((r) => returnReminderDue(r, now)),
      (r) => this.events.returnReminder(r.id),
    );
  }

  private async overdueNotices(now: Date): Promise<number> {
    const rows = await this.prisma.booking.findMany({
      where: { status: 'IN_RIDE', endAt: { lte: now }, notifications: { none: { type: 'RETURN_OVERDUE' } } },
      select: { id: true, status: true, endAt: true, pricingSnapshot: true },
      take: BATCH,
    });
    const due = rows.filter((r) =>
      returnOverdueDue(
        { status: r.status, endAt: r.endAt, graceMinutes: (r.pricingSnapshot as unknown as PlanRates).graceMinutes },
        now,
      ),
    );
    return this.count(due, (r) => this.events.returnOverdue(r.id));
  }

  /** Runs `send` for each row and counts the messages that were really sent. */
  private async count<T>(rows: T[], send: (row: T) => Promise<boolean>): Promise<number> {
    let sent = 0;
    for (const row of rows) if (await send(row)) sent++;
    return sent;
  }

  private async step(name: string, run: () => Promise<unknown>) {
    try {
      await run();
    } catch (e) {
      this.logger.error(`Job step "${name}" failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
