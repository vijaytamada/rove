import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardQuery } from './dto/dashboard.dto.js';

/** Read-only numbers for each role's home. Nothing here changes data. */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Roles('SUPER_ADMIN')
  @Get('admin')
  admin(@Query() query: DashboardQuery) {
    return this.dashboard.admin(query.range);
  }

  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  @Get('city/:id')
  city(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: DashboardQuery) {
    return this.dashboard.city(user, id, query.range);
  }

  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('station/:id')
  station(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: DashboardQuery) {
    return this.dashboard.station(user, id, query.range);
  }

  @Roles('CUSTOMER')
  @Get('customer')
  customer(@CurrentUser() user: AuthUser) {
    return this.dashboard.customer(user);
  }
}
