import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/app-exception.js';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { ListSettlementsQuery, PayOutstandingDto } from './dto/settlement.dto.js';
import { SettlementsService } from './settlements.service.js';

function checkKey(key: string | undefined) {
  if (key !== undefined && (key.length < 8 || key.length > 100)) {
    throw new AppException(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8 to 100 characters.');
  }
}

/** The customer's side: see the final bill of a ride and pay what is owed. */
@ApiTags('settlements')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('bookings')
export class BookingSettlementController {
  constructor(@Inject(SettlementsService) private readonly settlements: SettlementsService) {}

  @Get(':id/settlement')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.forCustomer(user, id);
  }

  /** Mock card payment of the amount owed. Send an `Idempotency-Key` header so a retry never charges twice. */
  @Post(':id/settlement/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayOutstandingDto,
    @Headers('idempotency-key') key?: string,
  ) {
    checkKey(key);
    return this.settlements.payOutstanding(user, id, dto, key);
  }
}

/** The station's side: what is still owed, refunds that did not go through, taking payment at the desk. */
@ApiTags('settlements')
@ApiBearerAuth()
@Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
@Controller('settlements')
export class StaffSettlementsController {
  constructor(@Inject(SettlementsService) private readonly settlements: SettlementsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListSettlementsQuery) {
    return this.settlements.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.staffView(user, id);
  }

  /** The customer paid what they owed at the desk (mock). */
  @Post(':id/collect')
  @HttpCode(200)
  collect(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayOutstandingDto,
    @Headers('idempotency-key') key?: string,
  ) {
    checkKey(key);
    return this.settlements.collectAtDesk(user, id, dto, key);
  }

  @Post(':id/retry-refund')
  @HttpCode(200)
  retryRefund(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.retryRefund(user, id);
  }
}
