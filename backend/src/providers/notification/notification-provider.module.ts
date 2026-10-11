import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { MockNotificationProvider } from './mock-notification.provider.js';
import { NOTIFICATION_PROVIDER } from './notification.provider.js';

/** Picks the notification provider from NOTIFICATION_PROVIDER. Add a real SMS or push sender here. */
@Module({
  providers: [
    {
      provide: NOTIFICATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const kind = config.get('NOTIFICATION_PROVIDER', { infer: true });
        switch (kind) {
          case 'mock':
            return new MockNotificationProvider();
          default:
            throw new Error(`Unknown NOTIFICATION_PROVIDER: ${String(kind)}`);
        }
      },
    },
  ],
  exports: [NOTIFICATION_PROVIDER],
})
export class NotificationProviderModule {}
