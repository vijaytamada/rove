import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQuery } from '../../../common/page-query.dto.js';

export class ListAuditQuery extends PageQuery {
  /** Only what this person did. */
  @IsOptional()
  @IsUUID()
  actorId?: string;

  /** An action code, e.g. SETTLEMENT_COLLECT. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  /** Everything that happened to one booking, settlement, user and so on. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;
}
