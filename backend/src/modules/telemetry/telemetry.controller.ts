import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/app-exception.js';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.decorators.js';
import type { Env } from '../../config/env.js';
import { HistoryQuery, IngestDto } from './dto/telemetry.dto.js';
import { TelemetryService } from './telemetry.service.js';

@ApiTags('telemetry')
@Controller()
export class TelemetryController {
  private readonly ingestKey: Buffer;

  constructor(
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.ingestKey = Buffer.from(config.get('TELEMETRY_INGEST_KEY', { infer: true }));
  }

  /** Where trackers (or their gateway) post readings. No login: the shared device key is the credential. */
  @Public()
  @Post('telemetry')
  @HttpCode(200)
  @ApiHeader({ name: 'x-device-key', required: true })
  ingest(@Headers('x-device-key') key: string | undefined, @Body() dto: IngestDto) {
    const given = Buffer.from(key ?? '');
    // Constant-time compare; a different length can never match.
    if (given.length !== this.ingestKey.length || !timingSafeEqual(given, this.ingestKey)) {
      throw new AppException(401, 'INVALID_DEVICE_KEY', 'The device key is not valid.');
    }
    return this.telemetry.ingestReadings(
      dto.readings.map((r) => ({
        vehicleId: r.vehicleId,
        recordedAt: new Date(r.recordedAt),
        latitude: r.latitude,
        longitude: r.longitude,
        speedKmh: r.speedKmh,
        batteryPercent: r.batteryPercent,
        odometerKm: r.odometerKm,
        ignition: r.ignition,
      })),
    );
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('fleet/live')
  live(@CurrentUser() user: AuthUser) {
    return this.telemetry.liveFleet(user);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('vehicles/:id/telemetry')
  history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: HistoryQuery) {
    return this.telemetry.history(user, id, query);
  }
}
