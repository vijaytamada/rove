import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../../../common/page-query.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCityDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  state!: string;

  /** IANA time zone, e.g. Asia/Kolkata. Defaults to Asia/Kolkata. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class UpdateCityDto {
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
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListCitiesQuery extends PageQuery {}
