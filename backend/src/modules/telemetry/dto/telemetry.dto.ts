import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TELEMETRY_RULES } from '../telemetry-rules.js';

export class ReadingDto {
  @IsUUID()
  vehicleId!: string;

  /** When the tracker took the reading, ISO 8601. */
  @IsDateString()
  recordedAt!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsNumber()
  @Min(0)
  @Max(200)
  speedKmh!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  odometerKm!: number;

  @IsBoolean()
  ignition!: boolean;
}

export class IngestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TELEMETRY_RULES.MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => ReadingDto)
  readings!: ReadingDto[];
}

export class HistoryQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TELEMETRY_RULES.HISTORY_MAX)
  limit?: number;
}
