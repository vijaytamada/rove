import { Module } from '@nestjs/common';
import { PaymentProviderModule } from '../../providers/payment/payment-provider.module.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [PaymentProviderModule],
  providers: [PaymentsService],
  exports: [PaymentsService, PaymentProviderModule],
})
export class PaymentsModule {}
