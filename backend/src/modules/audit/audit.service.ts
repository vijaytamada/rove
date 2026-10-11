import { Inject, Injectable, Logger } from '@nestjs/common';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import type { Prisma, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ListAuditQuery } from './dto/audit.dto.js';

export interface AuditEntryInput {
  /** Null when the system acted (a provider's webhook). */
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  route?: string | null;
  /** Small and safe: ids, amounts, enum values. Never a request body, a password or an identity number. */
  details?: Record<string, unknown> | null;
}

export interface AuditEntryView {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
  details: unknown;
  actor: { id: string; fullName: string; role: Role } | null;
}

/** The trail of who did what. Writing never throws: an audit failure must not undo or block the action it records. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: AuditEntryInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          actorRole: input.actorRole,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          route: input.route ?? null,
          details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e) {
      this.logger.error(`Could not record ${input.action}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Newest first. Super admin only (the controller enforces it). */
  async list(query: ListAuditQuery): Promise<Page<AuditEntryView>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };
    const { page, limit, skip, take } = pageArgs(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        route: r.route,
        details: r.details,
        actor: r.actor,
      })),
      total,
      page,
      limit,
    };
  }
}
