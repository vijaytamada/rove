import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { JobsRunner } from './jobs.runner.js';
import { JobsService } from './jobs.service.js';

/** Background work: expiring unpaid holds and sending reminders. */
@Module({
  imports: [NotificationsModule],
  providers: [JobsService, JobsRunner],
  exports: [JobsService, JobsRunner],
})
export class JobsModule {}
