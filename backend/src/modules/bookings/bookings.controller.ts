import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/app-exception.js';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto, ListBookingsQuery, PayBookingDto, QuoteBookingDto } from './dto/booking.dto.js';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  /** Price and availability for one scooter and window. Public, so people can see prices before signing in. */
  @Public()
  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteBookingDto) {
    return this.bookings.quote(dto);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user, dto);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListBookingsQuery) {
    return this.bookings.list(user, query);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.get(user, id);
  }

  /** Mock checkout. Send an `Idempotency-Key` header so a retry never charges twice. */
  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Post(':id/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey !== undefined && (idempotencyKey.length < 8 || idempotencyKey.length > 100)) {
      throw new AppException(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8 to 100 characters.');
    }
    return this.bookings.pay(user, id, dto, idempotencyKey);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.cancel(user, id);
  }
}
