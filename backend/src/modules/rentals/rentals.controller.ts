import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { ListStationBookingsQuery, PickupDto, ReturnDto } from './dto/rental.dto.js';
import { RentalsService } from './rentals.service.js';

/** The station desk: find a booking, hand the scooter over, take it back, mark no-shows. */
@ApiTags('station desk')
@ApiBearerAuth()
@Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
@Controller('station/bookings')
export class RentalsController {
  constructor(@Inject(RentalsService) private readonly rentals: RentalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListStationBookingsQuery) {
    return this.rentals.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentals.get(user, id);
  }

  @Post(':id/pickup')
  @HttpCode(200)
  pickup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickupDto) {
    return this.rentals.pickup(user, id, dto);
  }

  @Post(':id/return')
  @HttpCode(200)
  returnRental(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnDto) {
    return this.rentals.returnRental(user, id, dto);
  }

  @Post(':id/no-show')
  @HttpCode(200)
  noShow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentals.markNoShow(user, id);
  }
}
