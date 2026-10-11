import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import { Prisma, type KycStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { KYC_PROVIDER, KycWebhookError, type KycProvider, type KycWebhookResult } from '../../providers/kyc/kyc.provider.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import { acceptsOutcome, attemptsLeft, decideStart } from './kyc-rules.js';

export interface KycView {
  status: KycStatus | 'NOT_STARTED';
  verifiedAt: Date | null;
  rejectionReason: string | null;
  /** Tries left if this one does not work out. 0 means the customer must contact support. */
  attemptsLeft: number;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationEventsService) private readonly events: NotificationEventsService,
  ) {}

  async status(userId: string): Promise<KycView> {
    const record = await this.prisma.kycRecord.findUnique({ where: { userId } });
    if (!record) return { status: 'NOT_STARTED', verifiedAt: null, rejectionReason: null, attemptsLeft: attemptsLeft(0) };
    return {
      status: record.status,
      verifiedAt: record.verifiedAt,
      rejectionReason: record.rejectionReason,
      attemptsLeft: attemptsLeft(record.attempts),
    };
  }

  async isVerified(userId: string): Promise<boolean> {
    return (await this.status(userId)).status === 'VERIFIED';
  }

  /**
   * The customer agrees to verification and the provider runs it. A verified customer is left as they are, a check that
   * is still waiting is not started twice, and a rejected one can be tried again a few times (see kyc-rules.ts).
   */
  async start(userId: string, consent: boolean, now = new Date()): Promise<KycView> {
    if (!consent) throw new AppException(400, 'CONSENT_REQUIRED', 'Please agree to verification to continue.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true, role: true } });
    const existing = await this.prisma.kycRecord.findUnique({ where: { userId } });
    const decision = decideStart(existing, now);
    if (decision.action === 'ALREADY_VERIFIED' || decision.action === 'ALREADY_PENDING') return this.status(userId);
    if (decision.action === 'REFUSE') {
      throw new AppException(
        409,
        'KYC_ATTEMPTS_EXCEEDED',
        'We could not verify your identity after several tries. Please contact support.',
      );
    }

    const outcome = await this.provider.start({ userId, fullName: user.fullName });
    const data = {
      provider: this.provider.name,
      providerRef: outcome.providerRef,
      status: outcome.status,
      attempts: decision.attempts,
      consentAt: now,
      verifiedAt: outcome.status === 'VERIFIED' ? now : null,
      rejectionReason: outcome.rejectionReason ?? null,
    };
    try {
      await this.prisma.kycRecord.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    } catch (e) {
      // Two taps at once: the other one created the record first. Whatever it decided stands.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.status(userId);
      throw e;
    }
    await this.audit.record({
      actorId: userId,
      actorRole: user.role,
      action: 'KYC_STARTED',
      entityType: 'user',
      entityId: userId,
      details: { provider: this.provider.name, attempt: decision.attempts },
    });
    if (outcome.status !== 'PENDING') {
      await this.audit.record({
        actorId: userId,
        actorRole: user.role,
        action: outcome.status === 'VERIFIED' ? 'KYC_VERIFIED' : 'KYC_REJECTED',
        entityType: 'user',
        entityId: userId,
        details: { provider: this.provider.name, attempt: decision.attempts },
      });
    }
    return this.status(userId);
  }

  /**
   * The provider's webhook. A forged or unreadable message is refused (the caller gets 401 or 400); a genuine one that
   * changes nothing (a repeat, a late contradiction, an unknown reference) is accepted and ignored, so the provider
   * does not keep retrying it.
   */
  async handleWebhook(input: { rawBody: Buffer | undefined; headers: Record<string, string | string[] | undefined> }): Promise<void> {
    let result: KycWebhookResult | null;
    try {
      result = this.provider.parseWebhook(input);
    } catch (e) {
      if (e instanceof KycWebhookError) {
        if (e.reason === 'BAD_SIGNATURE') throw new AppException(401, 'INVALID_SIGNATURE', 'The webhook signature is not valid.');
        throw new AppException(400, 'INVALID_WEBHOOK', 'The webhook could not be read.');
      }
      throw e;
    }
    if (result) await this.applyResult(result);
  }

  private async applyResult(result: KycWebhookResult): Promise<void> {
    const record = await this.prisma.kycRecord.findFirst({ where: { providerRef: result.providerRef }, include: { user: { select: { role: true } } } });
    if (!record) {
      this.logger.warn(`KYC webhook for an unknown reference (${result.providerRef.slice(0, 12)}...) ignored`);
      return;
    }
    if (!acceptsOutcome(record.status, result.status)) return;

    const now = new Date();
    // The status check in the filter makes a second copy of the same webhook (sent at the same moment) do nothing.
    const done = await this.prisma.kycRecord.updateMany({
      where: { id: record.id, status: 'PENDING', providerRef: result.providerRef },
      data: {
        status: result.status,
        verifiedAt: result.status === 'VERIFIED' ? now : null,
        rejectionReason: result.status === 'REJECTED' ? (result.rejectionReason ?? 'We could not verify your identity.') : null,
      },
    });
    if (done.count === 0) return;

    await this.audit.record({
      actorId: null,
      actorRole: null,
      action: result.status === 'VERIFIED' ? 'KYC_VERIFIED' : 'KYC_REJECTED',
      entityType: 'user',
      entityId: record.userId,
      details: { provider: record.provider, attempt: record.attempts, via: 'webhook' },
    });
    await this.events.kycResult(record.userId, {
      status: result.status,
      attempt: record.attempts,
      reason: result.rejectionReason ?? null,
      attemptsLeft: attemptsLeft(record.attempts),
    });
  }

  /**
   * Support lever: gives a customer who ran out of tries a fresh set. A verified customer has nothing to reset.
   * The change is recorded in the audit trail with who did it.
   */
  async reset(userId: string): Promise<KycView> {
    const record = await this.prisma.kycRecord.findUnique({ where: { userId } });
    if (!record) throw new AppException(404, 'KYC_NOT_FOUND', 'This customer has not started an identity check.');
    if (record.status === 'VERIFIED') throw new AppException(409, 'KYC_ALREADY_VERIFIED', 'This customer is already verified.');
    await this.prisma.kycRecord.update({
      where: { userId },
      data: {
        attempts: 0,
        // A check that never got an answer is closed, so the customer can start a new one at once.
        status: 'REJECTED',
        rejectionReason: record.status === 'PENDING' ? 'The check was reset by support.' : record.rejectionReason,
      },
    });
    return this.status(userId);
  }
}
