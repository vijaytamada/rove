import 'package:flutter/material.dart';

import '../format.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';

/// The final bill of a ride: deposit, each charge, and what it comes to. Shows backend amounts only.
class SettlementSummary extends StatelessWidget {
  const SettlementSummary({super.key, required this.settlement});

  final SettlementView settlement;

  @override
  Widget build(BuildContext context) {
    final s = settlement;
    final (label, hint, amount, color) = switch (s.status) {
      SettlementStatus.refunded => ('Refunded to you', null, s.refundAmount, Tokens.accentInk),
      SettlementStatus.refundPending => ('Your refund is on its way', 'It will reach you shortly.', s.refundAmount, null),
      SettlementStatus.outstanding => (
          'You owe',
          'The charges are more than your deposit. Pay the difference to book again.',
          s.outstandingAmount,
          const Color(0xFFB91C1C),
        ),
      SettlementStatus.cleared => ('You paid', null, s.outstandingAmount, Tokens.accentInk),
      SettlementStatus.noAction => (
          'Nothing to refund',
          s.totalCharges > 0 ? 'The charges used the whole deposit.' : null,
          null,
          null,
        ),
    };
    return Column(
      children: [
        _Line('Deposit paid', formatMoney(s.depositHeld)),
        const SizedBox(height: 12),
        if (s.lines.isEmpty)
          const _Line('Charges', 'None')
        else
          for (final l in s.lines) ...[
            _Line(
              l.label,
              '− ${formatMoney(l.amount)}',
              note: l.quantity > 1 ? '${l.description} · ${l.quantity} × ${formatMoney(l.unitAmount)}' : l.description,
            ),
            const SizedBox(height: 12),
          ],
        const Padding(padding: EdgeInsets.only(bottom: 12), child: Divider(height: 1, color: Tokens.line)),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
                  if (hint != null) Text(hint, style: const TextStyle(color: Tokens.inkMuted, fontSize: 12)),
                ],
              ),
            ),
            if (amount != null) Text(formatMoney(amount), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: color)),
          ],
        ),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.note});

  final String label;
  final String value;
  final String? note;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Tokens.inkMuted)),
                if (note != null) Text(note!, style: const TextStyle(color: Tokens.inkFaint, fontSize: 12)),
              ],
            ),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      );
}
