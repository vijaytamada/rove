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

class BookingStatusChip extends StatelessWidget {
  const BookingStatusChip(this.status, {super.key});

  final BookingStatus status;

  @override
  Widget build(BuildContext context) => StatusChip(status.label, tone: _tone(status));
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
                  BookingStatusChip(b.status),
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
                    child: Text(formatMoney(b.totalAmount),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                  Text(b.status == BookingStatus.pendingPayment ? 'Pay now' : 'View',
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
