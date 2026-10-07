import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../../common/page-query.dto.js';
import { DamageSeverity } from '../../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PickupDamageDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  description!: string;

  @IsEnum(DamageSeverity)
  severity!: DamageSeverity;
}

export class ReturnDamageDto extends PickupDamageDto {
  /** Flat charge in paise, taken from the deposit at settlement. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  feeAmount?: number;
}

/** Handing the scooter over. */
export class PickupDto {
  /** The 6-digit PIN the customer shows. */
  @Matches(/^\d{6}$/, { message: 'pin must be 6 digits' })
  pin!: string;

  /** Staff confirm they looked at the customer's ID. */
  @Equals(true, { message: 'idChecked must be true: check the customer ID first' })
  @IsBoolean()
  idChecked!: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  startOdometerKm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  startBatteryPercent!: number;

  /** Hand over a different scooter of the same model (the booked one is faulty). */
  @IsOptional()
  @IsUUID()
  replacementVehicleId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  swapReason?: string;

  /** Damage that is already there. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PickupDamageDto)
  damages?: PickupDamageDto[];
}

/** Taking the scooter back. */
export class ReturnDto {
  @IsUUID()
  returnStationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  endOdometerKm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  endBatteryPercent!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReturnDamageDto)
  damages?: ReturnDamageDto[];

  /** Take the scooter out of service even without damage. */
  @IsOptional()
  @IsBoolean()
  sendToMaintenance?: boolean;
}

export const STAFF_TABS = ['pickups', 'rides', 'past'] as const;
export type StaffTab = (typeof STAFF_TABS)[number];

export class ListStationBookingsQuery extends PageQuery {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  /** pickups = paid and waiting to be collected; rides = out now; past = returned or no-show. With `q` and no tab, everything is searched. */
  @IsOptional()
  @IsIn(STAFF_TABS)
  tab?: StaffTab;

  /** A booking code, a phone number or part of a customer name. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  q?: string;
}
