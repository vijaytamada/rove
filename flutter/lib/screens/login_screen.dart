import 'dart:async';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../auth/phone.dart';
import '../theme/tokens.dart';
import '../widgets/app_text_field.dart';
import '../widgets/form_banner.dart';
import '../widgets/otp_field.dart';
import '../widgets/primary_button.dart';
import '../widgets/wordmark.dart';

enum _Step { phone, code, name }

/// Customer sign-in: phone number -> 6-digit code -> name (only for a number we haven't seen before).
/// There is no separate "create account": a new number becomes an account after the name step.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();

  _Step _step = _Step.phone;
  String _e164 = '';
  String? _signupToken;
  bool _loading = false;
  String? _error;
  String? _fieldError;

  Timer? _timer;
  int _resendIn = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _resendIn = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || _resendIn <= 1) t.cancel();
      if (mounted) setState(() => _resendIn = _resendIn > 0 ? _resendIn - 1 : 0);
    });
  }

  void _begin() => setState(() {
        _loading = true;
        _error = null;
        _fieldError = null;
      });

  /// Step 1, and "Resend code" on step 2.
  Future<void> _sendCode({bool resend = false}) async {
    final phone = resend ? _e164 : normalizePhone(_phone.text);
    if (!isValidPhone(phone)) {
      setState(() {
        _error = null;
        _fieldError = 'Enter your 10-digit mobile number';
      });
      return;
    }
    final auth = AuthScope.of(context);
    _begin();
    final result = await auth.requestCode(phone);
    if (!mounted) return;
    setState(() => _loading = false);
    if (result.error != null) {
      setState(() => _error = result.error!.message);
      return;
    }
    setState(() {
      _e164 = phone;
      _step = _Step.code;
      _code.clear();
    });
    _startCountdown(result.resendAfterSeconds);
  }

  /// Step 2. On success for a known number the app switches to the signed-in screens by itself.
  Future<void> _verify() async {
    final code = _code.text.trim();
    if (_loading) return;
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _fieldError = 'Enter the 6-digit code');
      return;
    }
    final auth = AuthScope.of(context);
    _begin();
    final result = await auth.verifyCode(_e164, code);
    if (!mounted) return;
    if (result.needsName) {
      _timer?.cancel();
      setState(() {
        _loading = false;
        _signupToken = result.signupToken;
        _step = _Step.name;
      });
      return;
    }
    final error = result.error;
    setState(() {
      _loading = false;
      if (error == null) return;
      _code.clear();
      if (error.code == 'OTP_INVALID') {
        _fieldError = error.message;
      } else {
        _error = error.message;
      }
    });
  }

  /// Step 3: a new number gives their name, which creates the account.
  Future<void> _finishSignup() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _fieldError = 'Enter your name');
      return;
    }
    final auth = AuthScope.of(context);
    _begin();
    final error = await auth.completeSignup(signupToken: _signupToken!, fullName: name);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (error == null) return;
      if (error.code == 'SIGNUP_EXPIRED') {
        _step = _Step.phone;
        _signupToken = null;
      }
      _error = error.message;
    });
  }

  void _changeNumber() {
    _timer?.cancel();
    setState(() {
      _step = _Step.phone;
      _signupToken = null;
      _code.clear();
      _name.clear();
      _error = null;
      _fieldError = null;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (title, subtitle) = switch (_step) {
      _Step.phone => ("Let's get you riding", null),
      _Step.code => ('Enter the code', 'We sent a 6-digit code to ${formatPhone(_e164)}.'),
      _Step.name => ("What's your name?", null),
    };

    return PopScope(
      // Back steps through the form instead of leaving the app.
      canPop: _step == _Step.phone,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _changeNumber();
      },
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: Tokens.gutter, vertical: 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Wordmark(size: 20),
                    const SizedBox(height: 32),
                    Text(title, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                    if (subtitle != null) ...[
                      const SizedBox(height: 4),
                      Text(subtitle, style: const TextStyle(color: Tokens.inkMuted)),
                    ],
                    const SizedBox(height: 28),
                    if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 16)],
                    ...switch (_step) {
                      _Step.phone => _phoneStep(),
                      _Step.code => _codeStep(),
                      _Step.name => _nameStep(),
                    },
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _phoneStep() => [
        AppTextField(
          label: 'Mobile number',
          controller: _phone,
          hint: '98765 43210',
          prefix: '+91',
          inputFormatters: const [TenDigitFormatter()],
          keyboardType: TextInputType.number,
          autofillHints: const [AutofillHints.telephoneNumber],
          textInputAction: TextInputAction.done,
          autofocus: true,
          errorText: _fieldError,
          onSubmitted: (_) => _sendCode(),
        ),
        const SizedBox(height: 24),
        PrimaryButton(label: 'Continue', onPressed: _sendCode, loading: _loading),
      ];

  List<Widget> _codeStep() => [
        OtpField(
          controller: _code,
          autofocus: true,
          errorText: _fieldError,
          onChanged: (value) {
            if (_fieldError != null) setState(() => _fieldError = null);
            if (value.length == 6) _verify();
          },
          onSubmitted: (_) => _verify(),
        ),
        ..._devHint(),
        const SizedBox(height: 24),
        PrimaryButton(label: 'Verify', onPressed: _verify, loading: _loading),
        const SizedBox(height: 8),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton(
              onPressed: _resendIn > 0 || _loading ? null : () => _sendCode(resend: true),
              child: Text(_resendIn > 0 ? 'Resend code in ${_resendIn}s' : 'Resend code'),
            ),
            TextButton(onPressed: _changeNumber, child: const Text('Change number')),
          ],
        ),
      ];

  List<Widget> _nameStep() => [
        AppTextField(
          label: 'Full name',
          controller: _name,
          autofillHints: const [AutofillHints.name],
          textInputAction: TextInputAction.done,
          autofocus: true,
          errorText: _fieldError,
          onSubmitted: (_) => _finishSignup(),
        ),
        const SizedBox(height: 24),
        PrimaryButton(label: 'Create account', onPressed: _finishSignup, loading: _loading),
      ];

  List<Widget> _devHint() => kReleaseMode
      ? const []
      : const [
          Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text('Development mode: the code is always 123456.', style: TextStyle(color: Tokens.inkMuted)),
          ),
        ];
}
