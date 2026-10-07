import 'package:flutter/material.dart';

import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../theme/tokens.dart';
import '../widgets/form_banner.dart';
import '../widgets/primary_button.dart';

/// Mock identity check: agree, and it is approved straight away. Pops with `true` once verified.
class VerifyScreen extends StatefulWidget {
  const VerifyScreen({super.key});

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  bool _consent = false;
  bool _busy = false;
  String? _consentError;
  String? _error;

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
    final (kyc, error) = await BookingApi(AuthScope.of(context).api).kycStart();
    if (!mounted) return;
    if (error != null || kyc == null) {
      setState(() {
        _busy = false;
        _error = error?.message ?? 'Something went wrong. Try again.';
      });
      return;
    }
    if (!kyc.verified) {
      setState(() {
        _busy = false;
        _error = "We couldn't verify your identity.";
      });
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your identity')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 8, Tokens.gutter, 24),
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(color: Tokens.accentSoft, shape: BoxShape.circle),
            child: const Icon(Icons.verified_user_outlined, color: Tokens.accentInk),
          ),
          const SizedBox(height: 20),
          Text('Verify your identity', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
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
          PrimaryButton(label: 'Verify me', loading: _busy, onPressed: _verify),
        ],
      ),
    );
  }
}
