import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { CitiesModule } from './modules/cities/cities.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { StationsModule } from './modules/stations/stations.module.js';
import { VehiclesModule } from './modules/vehicles/vehicles.module.js';
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
    UsersModule,
    AuthModule,
    CitiesModule,
    StationsModule,
    VehiclesModule,
    HealthModule,
  ],
})
export class AppModule {}
