import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import type { KycStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { KYC_PROVIDER, type KycProvider } from '../../providers/kyc/kyc.provider.js';

export interface KycView {
  status: KycStatus | 'NOT_STARTED';
  verifiedAt: Date | null;
  rejectionReason: string | null;
}

@Injectable()
export class KycService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
  ) {}

  async status(userId: string): Promise<KycView> {
    const record = await this.prisma.kycRecord.findUnique({ where: { userId } });
    if (!record) return { status: 'NOT_STARTED', verifiedAt: null, rejectionReason: null };
    return { status: record.status, verifiedAt: record.verifiedAt, rejectionReason: record.rejectionReason };
  }

  async isVerified(userId: string): Promise<boolean> {
    return (await this.status(userId)).status === 'VERIFIED';
  }

  /** The customer agrees to verification and the provider runs it. A verified customer is left as they are. */
  async start(userId: string, consent: boolean): Promise<KycView> {
    if (!consent) throw new AppException(400, 'CONSENT_REQUIRED', 'Please agree to verification to continue.');
    const existing = await this.prisma.kycRecord.findUnique({ where: { userId } });
    if (existing?.status === 'VERIFIED') return this.status(userId);

    const outcome = await this.provider.start({ userId });
    const data = {
      provider: this.provider.name,
      providerRef: outcome.providerRef,
      status: outcome.status,
      consentAt: new Date(),
      verifiedAt: outcome.status === 'VERIFIED' ? new Date() : null,
      rejectionReason: outcome.rejectionReason ?? null,
    };
    await this.prisma.kycRecord.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.status(userId);
  }
}
