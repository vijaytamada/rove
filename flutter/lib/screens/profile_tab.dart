import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../auth/phone.dart';
import '../models/user.dart';
import '../theme/tokens.dart';
import '../widgets/app_text_field.dart';
import '../widgets/form_banner.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_chip.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final user = auth.user!;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile'), centerTitle: false),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 8, Tokens.gutter, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: Tokens.ink,
                    child: Text(user.initials, style: const TextStyle(color: Colors.white, fontSize: 18)),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.fullName, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                        Text(user.email ?? formatPhone(user.phone ?? ''), style: const TextStyle(color: Tokens.inkMuted), overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 8),
                        Wrap(spacing: 6, runSpacing: 6, children: [
                          if (user.role != Role.customer) StatusChip(user.role.label),
                          if (user.phone != null)
                            user.phoneVerified
                                ? const StatusChip('Phone verified', tone: ChipTone.success)
                                : const StatusChip('Phone not verified', tone: ChipTone.warning),
                        ]),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (user.phone != null && !user.phoneVerified) ...[
            const SizedBox(height: 16),
            _PhoneVerificationCard(phone: user.phone!),
          ],
          const SizedBox(height: 16),
          const _DetailsCard(),
          const SizedBox(height: 16),
          SecondaryButton(label: 'Sign out', onPressed: auth.logout),
        ],
      ),
    );
  }
}

class _PhoneVerificationCard extends StatefulWidget {
  const _PhoneVerificationCard({required this.phone});

  final String phone;

  @override
  State<_PhoneVerificationCard> createState() => _PhoneVerificationCardState();
}

class _PhoneVerificationCardState extends State<_PhoneVerificationCard> {
  final _code = TextEditingController();
  bool _sending = false;
  bool _verifying = false;
  bool _sent = false;
  String? _error;
  String? _codeError;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final auth = AuthScope.of(context);
    setState(() {
      _sending = true;
      _error = null;
    });
    final error = await auth.sendPhoneCode();
    if (!mounted) return;
    setState(() {
      _sending = false;
      _sent = error == null;
      _error = error?.message;
    });
  }

  Future<void> _verify() async {
    final auth = AuthScope.of(context);
    setState(() {
      _verifying = true;
      _error = null;
      _codeError = null;
    });
    final error = await auth.verifyPhoneCode(_code.text);
    if (!mounted) return;
    setState(() {
      _verifying = false;
      if (error == null) return; // The card disappears once the phone is verified.
      error.code == 'OTP_INVALID' ? _codeError = error.message : _error = error.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Verify your phone', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text("We'll text a 6-digit code to ${widget.phone}.", style: const TextStyle(color: Tokens.inkMuted)),
            if (!kReleaseMode)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Development mode: the code is always 123456.', style: TextStyle(color: Tokens.inkMuted)),
              ),
            const SizedBox(height: 16),
            if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 12)],
            SecondaryButton(label: _sent ? 'Resend code' : 'Send code', onPressed: _send, loading: _sending),
            const SizedBox(height: 16),
            AppTextField(
              label: 'Code',
              controller: _code,
              hint: '123456',
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: 6,
              errorText: _codeError,
            ),
            const SizedBox(height: 16),
            PrimaryButton(label: 'Verify', onPressed: _verify, loading: _verifying),
          ],
        ),
      ),
    );
  }
}

class _DetailsCard extends StatefulWidget {
  const _DetailsCard();

  @override
  State<_DetailsCard> createState() => _DetailsCardState();
}

class _DetailsCardState extends State<_DetailsCard> {
  final _formKey = GlobalKey<FormState>();
  TextEditingController? _name;
  TextEditingController? _phone;
  bool _saving = false;
  String? _error;
  String? _saved;
  Map<String, String> _fieldErrors = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_name == null) {
      final user = AuthScope.of(context).user!;
      _name = TextEditingController(text: user.fullName);
      _phone = TextEditingController(text: user.phone ?? '');
    }
  }

  @override
  void dispose() {
    _name?.dispose();
    _phone?.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = AuthScope.of(context);
    setState(() {
      _saving = true;
      _error = null;
      _saved = null;
      _fieldErrors = {};
    });
    final error = await auth.updateProfile(fullName: _name!.text, phone: _phone!.text);
    if (!mounted) return;
    final fieldErrors = error?.fieldErrors(['fullName', 'phone']) ?? {};
    setState(() {
      _saving = false;
      _fieldErrors = fieldErrors;
      _error = error != null && fieldErrors.isEmpty ? error.message : null;
      _saved = error == null ? 'Profile saved' : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Your details', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 16),
              if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 12)],
              if (_saved != null) ...[FormBanner.success(_saved!), const SizedBox(height: 12)],
              AppTextField(
                label: 'Full name',
                controller: _name!,
                textInputAction: TextInputAction.next,
                errorText: _fieldErrors['fullName'],
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: 'Phone',
                controller: _phone!,
                hint: '+919876543210',
                helper: 'Changing your phone number means verifying it again.',
                keyboardType: TextInputType.phone,
                errorText: _fieldErrors['phone'],
                validator: (v) {
                  final value = (v ?? '').replaceAll(RegExp(r'\s+'), '');
                  if (value.isEmpty || RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(value)) return null;
                  return 'Use international format, e.g. +919876543210';
                },
              ),
              const SizedBox(height: 16),
              SecondaryButton(label: 'Save changes', onPressed: _save, loading: _saving),
            ],
          ),
        ),
      ),
    );
  }
}
