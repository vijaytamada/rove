import 'package:flutter/material.dart';

import '../format.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';
import 'status_chip.dart';

ChipTone _tone(BookingStatus s) => switch (s) {
      BookingStatus.pendingPayment => ChipTone.warning,
      BookingStatus.confirmed ||
      BookingStatus.inRide ||
      BookingStatus.returned ||
      BookingStatus.settled =>
        ChipTone.success,
      BookingStatus.cancelled || BookingStatus.expired => ChipTone.muted,
      BookingStatus.noShow => ChipTone.danger,
    };

/// `owing`: the ride is settled but the customer still has money to pay, shown as "Payment due".
class BookingStatusChip extends StatelessWidget {
  const BookingStatusChip(this.status, {super.key, this.owing = false});

  final BookingStatus status;
  final bool owing;

  @override
  Widget build(BuildContext context) =>
      owing ? const StatusChip('Payment due', tone: ChipTone.danger) : StatusChip(status.label, tone: _tone(status));
}

class BookingCard extends StatelessWidget {
  const BookingCard({super.key, required this.booking, required this.onTap});

  final BookingView booking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(b.model.title,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                        Text(b.code, style: const TextStyle(color: Tokens.inkMuted)),
                      ],
                    ),
                  ),
                  BookingStatusChip(b.status, owing: b.owing),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.place_outlined, size: 18, color: Tokens.inkMuted),
                  const SizedBox(width: 8),
                  Expanded(child: Text(b.station.name, style: const TextStyle(color: Tokens.inkMuted))),
                ],
              ),
              const SizedBox(height: 6),
              Text(formatRange(b.startAt, b.endAt, b.station.timezone)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(b.owing ? 'Owe ${formatMoney(b.settlement!.outstandingAmount)}' : formatMoney(b.totalAmount),
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: b.owing ? const Color(0xFFB91C1C) : null)),
                  ),
                  Text(b.status == BookingStatus.pendingPayment || b.owing ? 'Pay now' : 'View',
                      style: const TextStyle(fontWeight: FontWeight.w500)),
                  const Icon(Icons.chevron_right, size: 18),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
