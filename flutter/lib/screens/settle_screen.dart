import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';

import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';
import '../widgets/form_banner.dart';
import '../widgets/settlement_summary.dart';
import '../widgets/sticky_cta.dart';

/// Demo payment of what a customer owes after a ride (charges beyond the deposit). Pops `true` once it is paid.
class SettleScreen extends StatefulWidget {
  const SettleScreen({super.key, required this.booking});

  final BookingView booking;

  @override
  State<SettleScreen> createState() => _SettleScreenState();
}

class _SettleScreenState extends State<SettleScreen> {
  bool _paying = false;
  bool _simulateFailure = false;
  String? _error;

  BookingView get _b => widget.booking;
  SettlementView get _s => _b.settlement!;

  Future<void> _pay() async {
    setState(() {
      _paying = true;
      _error = null;
    });
    final api = BookingApi(AuthScope.of(context).api);
    final (paid, error) = await api.paySettlement(_b.id, simulateFailure: _simulateFailure);
    if (!mounted) return;
    if (error != null || paid == null) {
      setState(() {
        _paying = false;
        _error = error?.message ?? 'Something went wrong. Try again.';
      });
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Pay what you owe')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 4, Tokens.gutter, 24),
        children: [
          const Text('The charges for your ride were more than your deposit. Pay the difference.',
              style: TextStyle(color: Tokens.inkMuted, fontSize: 16)),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_b.model.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                  Text('Ride ${_b.code}', style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
                  const SizedBox(height: 16),
                  const Divider(height: 1, color: Tokens.line),
                  const SizedBox(height: 16),
                  SettlementSummary(settlement: _s),
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
        totalAmount: _s.outstandingAmount,
        amountLabel: 'You owe',
        label: 'Pay ${formatMoney(_s.outstandingAmount)}',
        loading: _paying,
        onPressed: _pay,
        banner: _error == null ? null : FormBanner.error(_error!),
      ),
    );
  }
}
