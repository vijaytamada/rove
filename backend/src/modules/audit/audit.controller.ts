import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth.decorators.js';
import { AuditService } from './audit.service.js';
import { ListAuditQuery } from './dto/audit.dto.js';

/** The trail of staff and admin changes. Super admin only: it names people and what they did. */
@ApiTags('audit')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: ListAuditQuery) {
    return this.audit.list(query);
  }
}
