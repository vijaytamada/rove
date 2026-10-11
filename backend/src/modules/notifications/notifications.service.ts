import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import { Prisma, type Notification, type NotificationType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from '../../providers/notification/notification.provider.js';
import type { ListNotificationsQuery } from './dto/notification.dto.js';
import type { Message } from './notification-templates.js';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** The booking this is about, so clients can link to it. */
  bookingId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NewNotification {
  userId: string;
  type: NotificationType;
  bookingId: string | null;
  /** One message per key: raising the same event twice sends it once. */
  dedupeKey: string;
  message: Message;
}

/** A customer's inbox: storing messages, delivering them outside the app, and reading and marking them. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  /**
   * Stores the message and hands it to the provider. Never throws: a notification must not break the booking, payment
   * or return that caused it. Returns whether a new message was sent (false for a repeat of the same event).
   */
  async send(input: NewNotification): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { phone: true, status: true } });
      if (!user) return false;
      try {
        await this.prisma.notification.create({
          data: {
            userId: input.userId,
            type: input.type,
            title: input.message.title,
            body: input.message.body,
            bookingId: input.bookingId,
            dedupeKey: input.dedupeKey,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
        throw e;
      }
      try {
        await this.provider.deliver({ userId: input.userId, phone: user.phone, ...input.message });
      } catch (e) {
        // The message is in the inbox either way.
        this.logger.warn(`Delivering ${input.type} to ${input.userId} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      return true;
    } catch (e) {
      this.logger.error(`Could not send ${input.type} to ${input.userId}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  async list(user: AuthUser, query: ListNotificationsQuery): Promise<Page<NotificationView>> {
    const where: Prisma.NotificationWhereInput = { userId: user.id, ...(query.unread ? { readAt: null } : {}) };
    const { page, limit, skip, take } = pageArgs(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
      this.prisma.notification.count({ where }),
    ]);
    return { items: rows.map(toView), total, page, limit };
  }

  async unreadCount(user: AuthUser): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
  }

  /** Marks one of the user's own messages as read. Someone else's message is a 404. */
  async markRead(user: AuthUser, id: string): Promise<NotificationView> {
    const own = await this.prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!own) throw new AppException(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
    if (own.readAt) return toView(own);
    const updated = await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return toView(updated);
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    const done = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: done.count };
  }
}

function toView(n: Notification): NotificationView {
  return { id: n.id, type: n.type, title: n.title, body: n.body, bookingId: n.bookingId, readAt: n.readAt, createdAt: n.createdAt };
}
