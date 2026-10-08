import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';
import '../widgets/booking_cards.dart';
import '../widgets/form_banner.dart';
import '../widgets/load_states.dart';
import '../widgets/price_breakdown.dart';
import '../widgets/primary_button.dart';
import 'pay_screen.dart';

/// One booking: pickup code and PIN, where and when, the price, a timeline and (when allowed) cancel.
class BookingDetailScreen extends StatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId, this.initial, this.justConfirmed = false});

  final String bookingId;
  final BookingView? initial;

  /// Opened right after paying: shows the green "Booking confirmed" note.
  final bool justConfirmed;

  @override
  State<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends State<BookingDetailScreen> {
  late final BookingApi _api;
  BookingView? _booking;
  ApiError? _error;
  bool _loading = false;
  bool _started = false;
  bool _justCancelled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _api = BookingApi(AuthScope.of(context).api);
      _booking = widget.initial;
      _load(showSpinner: widget.initial == null);
    }
  }

  Future<void> _load({bool showSpinner = true}) async {
    if (showSpinner) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final (booking, error) = await _api.get(widget.bookingId);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (booking != null) _booking = booking;
      _error = booking == null ? error : null;
    });
  }

  Future<void> _cancel() async {
    final b = _booking!;
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CancelSheet(booking: b, api: _api),
    );
    if (done == true && mounted) {
      setState(() => _justCancelled = true);
      await _load(showSpinner: false);
    }
  }

  Future<void> _pay() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PayScreen(booking: _booking!)));
    if (mounted) _load(showSpinner: false);
  }

  @override
  Widget build(BuildContext context) {
    final b = _booking;
    return Scaffold(
      appBar: AppBar(title: Text(b == null ? 'Booking' : b.model.title)),
      body: _loading && b == null
          ? const Center(child: CircularProgressIndicator())
          : b == null
              ? MessageState(message: _error?.message ?? 'Booking not found.', onRetry: _load)
              : RefreshIndicator(onRefresh: () => _load(showSpinner: false), child: _content(b)),
    );
  }

  Widget _content(BookingView b) {
    final tz = b.station.timezone;
    final confirmed = widget.justConfirmed && b.status == BookingStatus.confirmed;
    final cancelled = _justCancelled && b.status == BookingStatus.cancelled;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(Tokens.gutter, 4, Tokens.gutter, 32),
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Scooter ${b.vehicleCode} · Booking ${b.code}', style: const TextStyle(color: Tokens.inkMuted)),
            ),
            BookingStatusChip(b.status),
          ],
        ),
        if (confirmed) ...[
          const SizedBox(height: 16),
          const FormBanner.success('Booking confirmed. Show your booking code and PIN at the station to pick up the scooter.'),
        ],
        if (cancelled) ...[
          const SizedBox(height: 16),
          FormBanner.success(
              'Booking cancelled.${b.refundedAmount > 0 ? ' ${formatMoney(b.refundedAmount)} is on its way back to you.' : ''}'),
        ],
        if (b.status == BookingStatus.inRide) ...[
          const SizedBox(height: 16),
          FormBanner.success(
              'Your ride is in progress. Bring the scooter back to any station in ${b.station.cityName} by ${formatDateTime(b.endAt, tz)} to avoid late charges.'),
        ],
        if (b.status == BookingStatus.returned && b.rental != null) ...[
          const SizedBox(height: 16),
          FormBanner.notice(
              'Returned${b.rental!.returnStationName == null ? '' : ' to ${b.rental!.returnStationName}'}${b.rental!.distanceKm == null ? '' : ' after ${b.rental!.distanceKm} km'}. Your deposit is held until the return is checked and settled.'),
        ],
        if (b.status == BookingStatus.noShow) ...[
          const SizedBox(height: 16),
          const FormBanner.notice(
              "You didn't pick up the scooter, so the booking was closed. Your deposit was refunded; the rental charge is kept."),
        ],
        if (b.pin != null) ...[
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(child: _Big('Booking code', b.code, spacing: 1.5)),
                  Container(width: 1, height: 48, color: Tokens.line),
                  const SizedBox(width: 16),
                  Expanded(child: _Big('Pickup PIN', b.pin!, spacing: 6)),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        _Section(
          'Pickup',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _IconLine(Icons.schedule, formatRange(b.startAt, b.endAt, tz)),
              const SizedBox(height: 10),
              _IconLine(Icons.place_outlined, '${b.station.name}\n${b.station.address}\n${b.station.hoursLabel}'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _Section(
          'Price',
          PriceBreakdown(
            rentalAmount: b.rentalAmount,
            depositAmount: b.depositAmount,
            totalAmount: b.totalAmount,
            hours: b.hours,
            refundedAmount: b.refundedAmount,
          ),
        ),
        const SizedBox(height: 12),
        _Section(
          'Rates you agreed to',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Rule('${b.includedKm} km included, then ${formatMoney(b.pricing.extraKmRateAmount)} per extra km'),
              _Rule(
                  'Late return: ${formatMoney(b.pricing.lateFeePerHourAmount)} per extra hour after ${b.pricing.graceMinutes} minutes'),
              const _Rule('The deposit comes back when you return the scooter in good shape'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _Section(
          'Timeline',
          Column(
            children: [
              for (final step in _timeline(b)) _TimelineRow(label: step.$1, at: step.$2 == null ? null : formatDateTime(step.$2!, tz)),
            ],
          ),
        ),
        if (b.status == BookingStatus.pendingPayment || b.cancellation.allowed) ...[
          const SizedBox(height: 24),
          if (b.status == BookingStatus.pendingPayment) PrimaryButton(label: 'Pay ${formatMoney(b.totalAmount)}', onPressed: _pay),
          if (b.cancellation.allowed) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _cancel,
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFB91C1C),
                side: const BorderSide(color: Color(0xFFFECACA)),
              ),
              child: const Text('Cancel booking'),
            ),
          ],
        ],
      ],
    );
  }

  /// What happened, in order, from the timestamps the backend keeps.
  List<(String, DateTime?)> _timeline(BookingView b) => [
        ('Booked', b.createdAt),
        if (b.confirmedAt != null) ('Paid and confirmed', b.confirmedAt),
        if (b.rental != null) ('Scooter picked up', b.rental!.startedAt),
        if (b.rental?.endedAt != null) ('Scooter returned', b.rental!.endedAt),
        if (b.status == BookingStatus.noShow) ('Marked as a no-show', null),
        if (b.status == BookingStatus.expired) ('Hold expired, nothing was charged', null),
        if (b.cancelledAt != null) ('Cancelled', b.cancelledAt),
        if (b.refundedAmount > 0) ('${formatMoney(b.refundedAmount)} refunded', null),
      ];
}

/// The confirmation sheet. The refund numbers come from the backend; nothing is worked out here.
class _CancelSheet extends StatefulWidget {
  const _CancelSheet({required this.booking, required this.api});

  final BookingView booking;
  final BookingApi api;

  @override
  State<_CancelSheet> createState() => _CancelSheetState();
}

class _CancelSheetState extends State<_CancelSheet> {
  bool _busy = false;
  String? _error;

  Future<void> _confirm() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final (_, error) = await widget.api.cancel(widget.booking.id);
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error.message;
      });
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.booking;
    final out = b.cancellation;
    final unpaid = b.status == BookingStatus.pendingPayment;
    return Padding(
      padding: EdgeInsets.fromLTRB(Tokens.gutter, 0, Tokens.gutter, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Cancel this booking?', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 12)],
          if (unpaid)
            const Text('Cancel this booking? Nothing has been charged.')
          else ...[
            Text.rich(TextSpan(children: [
              const TextSpan(text: "You'll get "),
              TextSpan(text: formatMoney(out.refundAmount), style: const TextStyle(fontWeight: FontWeight.w600)),
              const TextSpan(text: ' back to your original payment method.'),
            ])),
            if (out.retainedAmount > 0) ...[
              const SizedBox(height: 8),
              Text(
                "The ${formatMoney(out.retainedAmount)} rental charge isn't refunded when you cancel this close to the start time. Your deposit comes back in full.",
                style: const TextStyle(color: Tokens.inkMuted, fontSize: 14),
              ),
            ],
          ],
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(label: 'Keep booking', onPressed: _busy ? null : () => Navigator.of(context).pop(false)),
              ),
              const SizedBox(width: 12),
              Expanded(child: PrimaryButton(label: 'Cancel booking', loading: _busy, onPressed: _confirm)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title, this.child);

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 14),
              child,
            ],
          ),
        ),
      );
}

class _Big extends StatelessWidget {
  const _Big(this.label, this.value, {required this.spacing});

  final String label;
  final String value;
  final double spacing;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Tokens.inkMuted, fontSize: 13)),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, letterSpacing: spacing, fontFeatures: const [FontFeature.tabularFigures()])),
          ),
        ],
      );
}

class _IconLine extends StatelessWidget {
  const _IconLine(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Tokens.inkMuted),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
        ],
      );
}

class _Rule extends StatelessWidget {
  const _Rule(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
      );
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.label, this.at});

  final String label;
  final String? at;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 6),
              width: 8,
              height: 8,
              decoration: const BoxDecoration(color: Tokens.accent, shape: BoxShape.circle),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
                  if (at != null) Text(at!, style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
                ],
              ),
            ),
          ],
        ),
      );
}
