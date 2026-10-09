import { IsIn, IsOptional } from 'class-validator';
import { DEFAULT_RANGE, RANGE_KEYS, type RangeKey } from '../dashboard-rules.js';

export class DashboardQuery {
  /** The window for activity and money: the last 24 hours, 7 days or 30 days. Default 7 days. */
  @IsOptional()
  @IsIn(RANGE_KEYS)
  range: RangeKey = DEFAULT_RANGE;
}
