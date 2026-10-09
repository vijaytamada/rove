import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQuery } from '../../../common/page-query.dto.js';
import { SettlementStatus } from '../../../generated/prisma/client.js';

/** Mock provider only (not allowed in production): make the payment fail so the retry path can be seen. */
export class PayOutstandingDto {
  @IsOptional()
  @IsIn(['FAIL'])
  simulate?: 'FAIL';
}

export class ListSettlementsQuery extends PageQuery {
  /** Without a status, the ones that need someone to act: outstanding amounts and refunds that have not gone through. */
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @IsOptional()
  @IsUUID()
  stationId?: string;
}
