import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { CitiesModule } from './modules/cities/cities.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { StationsModule } from './modules/stations/stations.module.js';
import { VehiclesModule } from './modules/vehicles/vehicles.module.js';
import { KycModule } from './modules/kyc/kyc.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { RentalsModule } from './modules/rentals/rentals.module.js';
import { SettlementsModule } from './modules/settlements/settlements.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    RbacModule,
    AuditModule,
    UsersModule,
    AuthModule,
    CitiesModule,
    StationsModule,
    VehiclesModule,
    PricingModule,
    KycModule,
    BookingsModule,
    RentalsModule,
    SettlementsModule,
    DashboardModule,
    NotificationsModule,
    JobsModule,
    HealthModule,
  ],
})
export class AppModule {}
