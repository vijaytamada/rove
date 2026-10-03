import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PageQuery } from '../../../common/page-query.dto.js';
import { VehicleStatus, VehicleType } from '../../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateVehicleModelDto {
  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  brand!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  rangeKm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  topSpeedKmh!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  batteryCapacityWh?: number;
}

export class UpdateVehicleModelDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  brand?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  rangeKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  topSpeedKmh?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  batteryCapacityWh?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export const VEHICLE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export class CreateVehicleDto {
  @IsUUID()
  modelId!: string;

  @IsUUID()
  stationId!: string;

  /** Short internal code, e.g. BLR-001. Stored upper-case. */
  @Transform(upper)
  @Matches(VEHICLE_CODE_PATTERN, { message: 'code must be 2-20 characters: letters, numbers and dashes, e.g. BLR-001' })
  code!: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  registrationNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  odometerKm?: number;
}

export class UpdateVehicleDto {
  /** Moves the vehicle to another station you can manage. */
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  registrationNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  odometerKm?: number;
}

export class ChangeVehicleStatusDto {
  @IsEnum(VehicleStatus)
  status!: VehicleStatus;
}

export class ListVehiclesQuery extends PageQuery {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsUUID()
  modelId?: string;
}
