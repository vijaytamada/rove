import { Inject, Injectable } from '@nestjs/common';
import type { RefundReason } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../providers/payment/payment.provider.js';

/** Money going back to a customer. Shared by cancellation, no-show handling and (Phase 6) settlement. */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Refunds `amount` of a successful payment and records the attempt. A failed gateway call is stored as a FAILED
   * refund (for a person to follow up) instead of being lost. Safe to call twice: the gateway key is per payment+reason.
   */
  async refund(paymentId: string, amount: number, providerRef: string | null, reason: RefundReason): Promise<void> {
    const result = providerRef
      ? await this.provider.refund({ providerRef, amount, idempotencyKey: `refund-${paymentId}-${reason}` })
      : ({ ok: false, reason: 'The payment has no gateway reference.' } as const);
    await this.prisma.refund.create({
      data: {
        paymentId,
        refundAmount: amount,
        status: result.ok ? 'SUCCEEDED' : 'FAILED',
        reason,
        provider: this.provider.name,
        providerRef: result.ok ? result.providerRef : null,
      },
    });
  }
}
