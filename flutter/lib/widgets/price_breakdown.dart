import 'package:flutter/material.dart';

import '../format.dart';
import '../theme/tokens.dart';

/// Rental, the refundable deposit as its own line, and the total. Shows backend amounts only.
class PriceBreakdown extends StatelessWidget {
  const PriceBreakdown({
    super.key,
    required this.rentalAmount,
    required this.depositAmount,
    required this.totalAmount,
    required this.hours,
    this.refundedAmount = 0,
  });

  final int rentalAmount;
  final int depositAmount;
  final int totalAmount;
  final int hours;

  /// Money already returned (cancelled bookings).
  final int refundedAmount;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _Line('Rental · $hours ${hours == 1 ? 'hour' : 'hours'}', formatMoney(rentalAmount)),
        const SizedBox(height: 12),
        _Line(
          'Refundable deposit',
          formatMoney(depositAmount),
          note: 'Returned after you bring the scooter back',
        ),
        const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider(height: 1, color: Tokens.line)),
        Row(
          children: [
            const Expanded(child: Text('Total', style: TextStyle(fontWeight: FontWeight.w600))),
            Text(formatMoney(totalAmount), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          ],
        ),
        if (refundedAmount > 0) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              const Expanded(child: Text('Refunded to you', style: TextStyle(color: Tokens.accentInk))),
              Text(formatMoney(refundedAmount),
                  style: const TextStyle(color: Tokens.accentInk, fontWeight: FontWeight.w500)),
            ],
          ),
        ],
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
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
              if (note != null) Text(note!, style: const TextStyle(color: Tokens.inkFaint, fontSize: 12)),
            ],
          ),
        ),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
      ],
    );
  }
}
