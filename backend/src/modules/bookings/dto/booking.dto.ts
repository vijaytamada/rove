import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PageQuery } from '../../../common/page-query.dto.js';
import { BOOKING_RULES } from '../booking-rules.js';

/** What a customer picks: a scooter, when to start (default: now) and for how many whole hours. */
export class QuoteBookingDto {
  @IsUUID()
  vehicleId!: string;

  /** ISO-8601 start. Leave out to start now. */
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  @Type(() => Number)
  @IsInt()
  @Min(BOOKING_RULES.MIN_HOURS)
  @Max(BOOKING_RULES.MAX_HOURS)
  hours!: number;
}

export class CreateBookingDto extends QuoteBookingDto {}

export class PayBookingDto {
  /** Mock provider only (not allowed in production): make the payment fail so the retry path can be seen. */
  @IsOptional()
  @IsIn(['FAIL'])
  simulate?: 'FAIL';
}

export const BOOKING_TABS = ['active', 'upcoming', 'past'] as const;
export type BookingTab = (typeof BOOKING_TABS)[number];

export class ListBookingsQuery extends PageQuery {
  /** active = waiting for payment, started or in progress; upcoming = paid and not yet started; past = finished. */
  @IsOptional()
  @IsIn(BOOKING_TABS)
  tab?: BookingTab;
}

/** For the public scooter list: show what is free in a window (default: the next hour). */
export class AvailabilityQuery {
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(BOOKING_RULES.MIN_HOURS)
  @Max(BOOKING_RULES.MAX_HOURS)
  hours?: number;
}
