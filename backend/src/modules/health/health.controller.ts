import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/app-exception.js';
import { Public } from '../../common/auth.decorators.js';
import { HealthService } from './health.service.js';
import type { HealthReport } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'Service, database and Redis status' })
  check(): Promise<HealthReport> {
    return this.health.check();
  }

  /** Is the process running? No dependencies are checked: a container platform restarts the container if this fails. */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Can it serve traffic? 503 while the database or Redis is down, so a load balancer stops sending requests. */
  @Public()
  @Get('ready')
  async ready(): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') throw new AppException(503, 'NOT_READY', 'The service is not ready.', report.checks);
    return report;
  }
}
