import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
}
