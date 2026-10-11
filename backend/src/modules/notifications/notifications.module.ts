import { Module } from '@nestjs/common';
import { NotificationProviderModule } from '../../providers/notification/notification-provider.module.js';
import { NotificationEventsService } from './notification-events.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [NotificationProviderModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventsService],
  exports: [NotificationEventsService],
})
export class NotificationsModule {}
