import 'dart:async';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';

import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';
import '../widgets/form_banner.dart';
import '../widgets/price_breakdown.dart';
import '../widgets/sticky_cta.dart';
import 'book_screen.dart';
import 'booking_detail_screen.dart';

/// Demo checkout: order summary, a hold countdown and one Pay button. No card details are collected.
class PayScreen extends StatefulWidget {
  const PayScreen({super.key, required this.booking});

  final BookingView booking;

  @override
  State<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends State<PayScreen> {
  Timer? _tick;
  DateTime _now = DateTime.now();
  bool _paying = false;
  bool _simulateFailure = false;
  bool _holdLost = false;
  String? _error;

  BookingView get _b => widget.booking;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  bool get _expired {
    final end = _b.holdExpiresAt;
    return _holdLost || (end != null && !end.isAfter(_now));
  }

  Future<void> _pay() async {
    setState(() {
      _paying = true;
      _error = null;
    });
    final api = BookingApi(AuthScope.of(context).api);
    final (paid, error) = await api.pay(_b.id, simulateFailure: _simulateFailure);
    if (!mounted) return;
    if (error != null || paid == null) {
      setState(() {
        _paying = false;
        _error = error?.message ?? 'Something went wrong. Try again.';
        _holdLost = error?.code == 'HOLD_EXPIRED';
      });
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => BookingDetailScreen(bookingId: paid.id, initial: paid, justConfirmed: true)),
    );
  }

  void _bookAgain() {
    Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => BookScreen(vehicleId: _b.vehicleId)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final end = _b.holdExpiresAt;
    return Scaffold(
      appBar: AppBar(title: const Text('Pay to confirm')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 4, Tokens.gutter, 24),
        children: [
          const Text("We're holding this scooter for you. Pay before the timer ends.",
              style: TextStyle(color: Tokens.inkMuted, fontSize: 16)),
          const SizedBox(height: 16),
          Card(
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
                            Text(_b.model.title,
                                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                            const SizedBox(height: 2),
                            Text('${_b.station.name} · ${formatRange(_b.startAt, _b.endAt, _b.station.timezone)}',
                                style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
                          ],
                        ),
                      ),
                      if (end != null && !_expired)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(999)),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.timer_outlined, size: 16, color: Color(0xFF92400E)),
                              const SizedBox(width: 4),
                              Text(formatCountdown(end, _now),
                                  style: const TextStyle(color: Color(0xFF92400E), fontWeight: FontWeight.w500)),
                            ],
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Divider(height: 1, color: Tokens.line),
                  const SizedBox(height: 16),
                  PriceBreakdown(
                    rentalAmount: _b.rentalAmount,
                    depositAmount: _b.depositAmount,
                    totalAmount: _b.totalAmount,
                    hours: _b.hours,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Payment', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  const Text('This is a demo checkout. Nothing is charged and no card details are asked for.',
                      style: TextStyle(color: Tokens.inkMuted, fontSize: 14)),
                  if (!kReleaseMode)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      dense: true,
                      value: _simulateFailure,
                      onChanged: _paying ? null : (v) => setState(() => _simulateFailure = v ?? false),
                      title: const Text('Make this payment fail (to see the retry)', style: TextStyle(fontSize: 14)),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: StickyCta(
        totalAmount: _b.totalAmount,
        label: 'Pay ${formatMoney(_b.totalAmount)}',
        loading: _paying,
        onPressed: _expired ? null : _pay,
        banner: _expired
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FormBanner.error(_error ?? 'Your hold on this scooter ran out.'),
                  const SizedBox(height: 8),
                  TextButton(onPressed: _bookAgain, child: const Text('Book it again')),
                ],
              )
            : (_error == null ? null : FormBanner.error(_error!)),
      ),
    );
  }
}
