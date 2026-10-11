import { Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { JobsRunner } from './jobs.runner.js';
import { JobsService } from './jobs.service.js';

/** Background work: expiring unpaid holds and sending reminders. */
@Module({
  imports: [NotificationsModule, TelemetryModule],
  providers: [JobsService, JobsRunner],
  exports: [JobsService, JobsRunner],
})
export class JobsModule {}
