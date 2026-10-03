import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
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
import { StationStatus } from '../../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const HOURS_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const HOURS_MESSAGE = 'must be a time in 24-hour HH:mm format, e.g. 09:00';

export class CreateStationDto {
  @IsUUID()
  cityId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address!: string;

  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;

  @IsOptional()
  @Matches(HOURS_PATTERN, { message: `opensAt ${HOURS_MESSAGE}` })
  opensAt?: string;

  @IsOptional()
  @Matches(HOURS_PATTERN, { message: `closesAt ${HOURS_MESSAGE}` })
  closesAt?: string;

  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;
}

/** The city of a station cannot be changed. */
export class UpdateStationDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  /** Send null on both to make the station always open. */
  @IsOptional()
  @Matches(HOURS_PATTERN, { message: `opensAt ${HOURS_MESSAGE}` })
  opensAt?: string | null;

  @IsOptional()
  @Matches(HOURS_PATTERN, { message: `closesAt ${HOURS_MESSAGE}` })
  closesAt?: string | null;

  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;
}

export class ListStationsQuery extends PageQuery {
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;
}
