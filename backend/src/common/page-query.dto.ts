import { Type } from 'class-transformer';
import { IsInt, Max, Min, IsOptional } from 'class-validator';

/** ?page=1&limit=20 (max 100). Extend for list endpoints. */
export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function pageArgs(q: PageQuery) {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}
