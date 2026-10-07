import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { PageQuery } from '../../../common/page-query.dto.js';

// Paise. The ceilings are sanity limits against typos.
const MAX_RATE = 10_000_000;
const MAX_DEPOSIT = 100_000_000;

export class CreatePricingPlanDto {
  @IsUUID()
  modelId!: string;

  /** Leave empty for the default plan used in every city without its own plan. */
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RATE)
  hourlyRateAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RATE)
  dailyRateAmount?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  includedKmPerHour!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE)
  extraKmRateAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE)
  lateFeePerHourAmount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DEPOSIT)
  depositAmount!: number;
}

/** Model and city are fixed once a plan exists; create a new plan instead. */
export class UpdatePricingPlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RATE)
  hourlyRateAmount?: number;

  /** null removes the day rate. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RATE)
  dailyRateAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  includedKmPerHour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE)
  extraKmRateAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE)
  lateFeePerHourAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DEPOSIT)
  depositAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListPricingPlansQuery extends PageQuery {
  @IsOptional()
  @IsUUID()
  modelId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;
}
