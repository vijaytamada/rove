import { Injectable, Logger } from '@nestjs/common';
import type { NotificationProvider, OutgoingNotification } from './notification.provider.js';

/** Writes the message to the log instead of sending it anywhere. */
@Injectable()
export class MockNotificationProvider implements NotificationProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockNotificationProvider');

  async deliver(message: OutgoingNotification): Promise<void> {
    this.logger.log(`To ${message.phone ?? message.userId}: ${message.title} - ${message.body}`);
  }
}
