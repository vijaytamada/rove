import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { AvailabilityQuery } from '../bookings/dto/booking.dto.js';
import {
  ChangeVehicleStatusDto,
  CreateVehicleDto,
  CreateVehicleModelDto,
  ListVehiclesQuery,
  UpdateVehicleDto,
  UpdateVehicleModelDto,
} from './dto/vehicle.dto.js';
import { VehicleModelsService } from './vehicle-models.service.js';
import { VehiclesService } from './vehicles.service.js';

@ApiTags('vehicles')
@Controller()
export class VehiclesController {
  constructor(
    @Inject(VehiclesService) private readonly vehicles: VehiclesService,
    @Inject(VehicleModelsService) private readonly models: VehicleModelsService,
  ) {}

  // ---- Public ----

  @Public()
  @Get('stations/:stationId/vehicles')
  listPublic(@Param('stationId', ParseUUIDPipe) stationId: string, @Query() query: AvailabilityQuery) {
    return this.vehicles.listPublic(stationId, query);
  }

  @Public()
  @Get('vehicles/:id')
  getPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.getPublic(id);
  }

  // ---- Vehicle models (global catalogue; super admin writes) ----

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('manage/vehicle-models')
  listModels() {
    return this.models.list();
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN')
  @Post('vehicle-models')
  createModel(@Body() dto: CreateVehicleModelDto) {
    return this.models.create(dto);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN')
  @Patch('vehicle-models/:id')
  updateModel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleModelDto) {
    return this.models.update(id, dto);
  }

  // ---- Vehicles (staff) ----

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('manage/vehicles')
  listManage(@CurrentUser() user: AuthUser, @Query() query: ListVehiclesQuery) {
    return this.vehicles.listManage(user, query);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('manage/vehicles/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.get(user, id);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  @Post('vehicles')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(user, dto);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  @Patch('vehicles/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicles.update(user, id, dto);
  }

  /** Employees may only flag MAINTENANCE; managers and admins may also set AVAILABLE / OFFLINE. */
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Patch('vehicles/:id/status')
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVehicleStatusDto,
  ) {
    return this.vehicles.changeStatus(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  @Delete('vehicles/:id')
  @HttpCode(204)
  async retire(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.vehicles.retire(user, id);
  }
}
