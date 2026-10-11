import 'dart:async';

import 'package:flutter/material.dart';

import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';
import '../widgets/form_banner.dart';
import '../widgets/primary_button.dart';

/// How often a check that is still waiting for the provider is looked at again.
const verifyPollInterval = Duration(seconds: 5);

/// Identity check: agree and it runs. It may finish at once, wait for the provider (then this screen keeps looking until
/// it is done), or be rejected (the customer can try again while they have tries left). Pops with `true` once verified.
class VerifyScreen extends StatefulWidget {
  const VerifyScreen({super.key});

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  KycView? _kyc;
  bool _started = false;
  bool _consent = false;
  bool _busy = false;
  String? _consentError;
  String? _error;
  Timer? _poll;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _refresh();
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  BookingApi get _api => BookingApi(AuthScope.of(context).api);

  /// Shows what the backend says now. A failed look (offline) keeps what is on screen.
  Future<void> _refresh() async {
    final (kyc, _) = await _api.kycStatus();
    if (!mounted || kyc == null) return;
    _apply(kyc);
  }

  void _apply(KycView kyc) {
    if (kyc.verified) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _kyc = kyc;
      _busy = false;
      _error = null;
    });
    // While the provider is still checking, look again every few seconds.
    if (kyc.pending) {
      _poll ??= Timer.periodic(verifyPollInterval, (_) => _refresh());
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  Future<void> _verify() async {
    if (!_consent) {
      setState(() => _consentError = 'Please agree to continue.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _consentError = null;
    });
    final (kyc, error) = await _api.kycStart();
    if (!mounted) return;
    if (error != null || kyc == null) {
      setState(() {
        _busy = false;
        _error = error?.message ?? 'Something went wrong. Try again.';
      });
      return;
    }
    _apply(kyc);
  }

  @override
  Widget build(BuildContext context) {
    final kyc = _kyc;
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your identity')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 8, Tokens.gutter, 24),
        children: [
          if (kyc == null)
            // Until the status is known, show nothing that could be the wrong state.
            const Padding(padding: EdgeInsets.only(top: 80), child: Center(child: CircularProgressIndicator()))
          else if (kyc.pending)
            ..._pending(context)
          else if (kyc.rejected)
            ..._rejected(context, kyc)
          else
            ..._form(context, retry: false),
        ],
      ),
    );
  }

  Widget _badge(IconData icon, {bool danger = false}) => Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(color: danger ? const Color(0xFFFEF2F2) : Tokens.accentSoft, shape: BoxShape.circle),
        child: Icon(icon, color: danger ? const Color(0xFFB91C1C) : Tokens.accentInk),
      );

  List<Widget> _pending(BuildContext context) => [
        _badge(Icons.hourglass_top),
        const SizedBox(height: 20),
        Text("We're checking your details",
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        const Text(
          "This usually takes a minute. You can leave this screen: we'll send you a notification when it's done.",
          style: TextStyle(color: Tokens.inkMuted, fontSize: 16),
        ),
        const SizedBox(height: 24),
        const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
        const SizedBox(height: 24),
        SecondaryButton(label: 'Check again', onPressed: _refresh),
      ];

  List<Widget> _rejected(BuildContext context, KycView kyc) => [
        _badge(Icons.gpp_bad_outlined, danger: true),
        const SizedBox(height: 20),
        Text("We couldn't verify your identity",
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        if (kyc.rejectionReason != null) ...[
          const SizedBox(height: 12),
          FormBanner.error(kyc.rejectionReason!),
        ],
        const SizedBox(height: 12),
        if (kyc.attemptsLeft > 0) ...[
          Text('You can try again. ${kyc.attemptsLeft} ${kyc.attemptsLeft == 1 ? 'try' : 'tries'} left.',
              style: const TextStyle(color: Tokens.inkMuted, fontSize: 16)),
          const SizedBox(height: 16),
          ..._consentAndButton(retry: true),
        ] else
          const Text("You've used all your tries. Please contact support and we'll help you get verified.",
              style: TextStyle(color: Tokens.inkMuted, fontSize: 16)),
      ];

  List<Widget> _form(BuildContext context, {required bool retry}) => [
        _badge(Icons.verified_user_outlined),
        const SizedBox(height: 20),
        Text('Verify your identity', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        const Text(
          'We confirm who you are once, before your first ride. This takes a moment.',
          style: TextStyle(color: Tokens.inkMuted, fontSize: 16),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFFF1F1F3), borderRadius: BorderRadius.circular(Tokens.radiusControl)),
          child: const Text(
            'This is a demo check: it is approved straight away and no documents are collected.',
            style: TextStyle(color: Tokens.inkMuted, fontSize: 14),
          ),
        ),
        const SizedBox(height: 20),
        ..._consentAndButton(retry: retry),
      ];

  List<Widget> _consentAndButton({required bool retry}) => [
        if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 16)],
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _consent,
          onChanged: _busy ? null : (v) => setState(() => _consent = v ?? false),
          title: const Text('I agree to my details being used to verify who I am before renting a scooter.',
              style: TextStyle(fontSize: 14)),
        ),
        if (_consentError != null)
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(_consentError!, style: const TextStyle(color: Tokens.danger, fontSize: 14)),
          ),
        const SizedBox(height: 12),
        PrimaryButton(label: retry ? 'Try again' : 'Verify me', loading: _busy, onPressed: _verify),
      ];
}
