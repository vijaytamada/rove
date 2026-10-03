import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { CreateStationDto, ListStationsQuery, UpdateStationDto } from './dto/station.dto.js';
import { StationsService } from './stations.service.js';

@ApiTags('stations')
@Controller()
export class StationsController {
  constructor(@Inject(StationsService) private readonly stations: StationsService) {}

  @Public()
  @Get('cities/:cityId/stations')
  listPublic(@Param('cityId', ParseUUIDPipe) cityId: string) {
    return this.stations.listPublic(cityId);
  }

  @Public()
  @Get('stations/:id')
  getPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.stations.getPublic(id);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('manage/stations')
  listManage(@CurrentUser() user: AuthUser, @Query() query: ListStationsQuery) {
    return this.stations.listManage(user, query);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  @Post('stations')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStationDto) {
    return this.stations.create(user, dto);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  @Patch('stations/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStationDto) {
    return this.stations.update(user, id, dto);
  }
}
