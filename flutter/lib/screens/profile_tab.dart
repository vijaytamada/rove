import 'dart:async';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../auth/phone.dart';
import '../models/user.dart';
import '../theme/tokens.dart';
import '../widgets/app_text_field.dart';
import '../widgets/form_banner.dart';
import '../widgets/otp_field.dart';
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
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 30,
                    backgroundColor: Tokens.ink,
                    child: Text(user.initials, style: const TextStyle(color: Colors.white, fontSize: 20)),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.fullName, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 2),
                        Text(
                          user.email ?? formatPhone(user.phone ?? ''),
                          style: const TextStyle(color: Tokens.inkMuted),
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (user.role != Role.customer) ...[
                          const SizedBox(height: 8),
                          StatusChip(user.role.label),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Personal details', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 20),
                  const _NameRow(),
                  const Divider(height: 32, color: Tokens.line),
                  const _PhoneRow(),
                  if (user.email != null) ...[
                    const Divider(height: 32, color: Tokens.line),
                    _DetailRow(
                      label: 'Email',
                      note: 'Used to sign in. Ask an admin to change it.',
                      child: Text(user.email!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          SecondaryButton(label: 'Sign out', onPressed: auth.logout),
        ],
      ),
    );
  }
}

/// One line of the details card: small label, the value, and a pencil on the right when it can be edited.
class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.child, this.onEdit, this.editLabel, this.note, this.noteIsSuccess = false});

  final String label;
  final Widget child;
  final VoidCallback? onEdit;
  final String? editLabel;
  final String? note;

  /// Green confirmation ("Name updated") instead of the grey helper text.
  final bool noteIsSuccess;

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
              const SizedBox(height: 4),
              child,
              if (note != null) ...[
                const SizedBox(height: 4),
                Text(note!, style: TextStyle(color: noteIsSuccess ? Tokens.accentInk : Tokens.inkMuted, fontSize: noteIsSuccess ? 14 : 13)),
              ],
            ],
          ),
        ),
        if (onEdit != null)
          Padding(
            padding: const EdgeInsets.only(left: 12),
            child: IconButton(
              onPressed: onEdit,
              tooltip: editLabel ?? 'Edit ${label.toLowerCase()}',
              icon: const Icon(Icons.edit_outlined, size: 18),
              style: IconButton.styleFrom(
                side: const BorderSide(color: Tokens.line),
                foregroundColor: Tokens.inkMuted,
                fixedSize: const Size(44, 44),
              ),
            ),
          ),
      ],
    );
  }
}

/// The name with a pencil; the pencil turns the row into a text box with Save and Cancel.
class _NameRow extends StatefulWidget {
  const _NameRow();

  @override
  State<_NameRow> createState() => _NameRowState();
}

class _NameRowState extends State<_NameRow> {
  final _name = TextEditingController();
  bool _editing = false;
  bool _saving = false;
  bool _saved = false;
  String? _error;
  String? _fieldError;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _startEditing(String current) => setState(() {
        _name.text = current;
        _editing = true;
        _saved = false;
        _error = null;
        _fieldError = null;
      });

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _fieldError = 'Enter your name');
      return;
    }
    final auth = AuthScope.of(context);
    setState(() {
      _saving = true;
      _error = null;
      _fieldError = null;
    });
    final error = await auth.updateProfile(fullName: _name.text);
    if (!mounted) return;
    final fieldErrors = error?.fieldErrors(['fullName']) ?? {};
    setState(() {
      _saving = false;
      _fieldError = fieldErrors['fullName'];
      _error = error != null && fieldErrors.isEmpty ? error.message : null;
      if (error == null) {
        _editing = false;
        _saved = true;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = AuthScope.of(context).user!;
    if (!_editing) {
      return _DetailRow(
        label: 'Full name',
        onEdit: () => _startEditing(user.fullName),
        note: _saved ? 'Name updated' : null,
        noteIsSuccess: true,
        child: Text(user.fullName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 12)],
        AppTextField(
          label: 'Full name',
          controller: _name,
          autofocus: true,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.name],
          errorText: _fieldError,
          onSubmitted: (_) => _save(),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: PrimaryButton(label: 'Save', onPressed: _save, loading: _saving)),
            const SizedBox(width: 12),
            Expanded(child: SecondaryButton(label: 'Cancel', onPressed: _saving ? null : () => setState(() => _editing = false))),
          ],
        ),
      ],
    );
  }
}

/// The phone line. The pencil opens a sheet: new number, then the code texted to it. The number is only
/// saved once the code is right. A saved number that was never verified shows "Verify now".
class _PhoneRow extends StatefulWidget {
  const _PhoneRow();

  @override
  State<_PhoneRow> createState() => _PhoneRowState();
}

class _PhoneRowState extends State<_PhoneRow> {
  String? _done;

  Future<void> _open(_PhoneMode mode) async {
    final saved = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _PhoneSheet(auth: AuthScope.of(context), mode: mode),
    );
    if (!mounted || saved == null) return;
    setState(() => _done = saved);
  }

  @override
  Widget build(BuildContext context) {
    final user = AuthScope.of(context).user!;
    final phone = user.phone;
    return _DetailRow(
      label: 'Mobile number',
      onEdit: () {
        setState(() => _done = null);
        _open(_PhoneMode.change);
      },
      editLabel: phone == null ? 'Add mobile number' : 'Change mobile number',
      note: _done,
      noteIsSuccess: true,
      child: phone == null
          ? const Text('Not added', style: TextStyle(fontSize: 16, color: Tokens.inkMuted))
          : Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(formatPhone(phone), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
                if (user.phoneVerified)
                  const StatusChip('Verified', tone: ChipTone.success)
                else ...[
                  const StatusChip('Not verified', tone: ChipTone.warning),
                  TextButton(
                    onPressed: () {
                      setState(() => _done = null);
                      _open(_PhoneMode.verify);
                    },
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
                    child: const Text('Verify now'),
                  ),
                ],
              ],
            ),
    );
  }
}

enum _PhoneMode { change, verify }

enum _PhoneStep { number, code }

class _PhoneSheet extends StatefulWidget {
  const _PhoneSheet({required this.auth, required this.mode});

  final AuthController auth;
  final _PhoneMode mode;

  @override
  State<_PhoneSheet> createState() => _PhoneSheetState();
}

class _PhoneSheetState extends State<_PhoneSheet> {
  final _digits = TextEditingController();
  final _code = TextEditingController();

  late _PhoneStep _step = widget.mode == _PhoneMode.verify ? _PhoneStep.code : _PhoneStep.number;
  String _sentTo = '';
  bool _busy = false;
  String? _error;
  String? _fieldError;
  Timer? _timer;
  int _resendIn = 0;

  @override
  void initState() {
    super.initState();
    if (widget.mode == _PhoneMode.verify) {
      _sentTo = widget.auth.user?.phone ?? '';
      _send();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _digits.dispose();
    _code.dispose();
    super.dispose();
  }

  void _countdown(int seconds) {
    _timer?.cancel();
    setState(() => _resendIn = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || _resendIn <= 1) t.cancel();
      if (mounted) setState(() => _resendIn = _resendIn > 0 ? _resendIn - 1 : 0);
    });
  }

  /// Sends a code: to the typed number (change) or to the saved one (verify).
  Future<void> _send() async {
    final verify = widget.mode == _PhoneMode.verify;
    final phone = verify ? _sentTo : normalizePhone(_digits.text);
    if (!verify && !isValidPhone(phone)) {
      setState(() => _fieldError = 'Enter your 10-digit mobile number');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _fieldError = null;
    });
    final result = verify ? await widget.auth.sendPhoneCode() : await widget.auth.startPhoneChange(phone);
    if (!mounted) return;
    final error = result.error;
    setState(() {
      _busy = false;
      if (error == null) {
        _sentTo = phone;
        _step = _PhoneStep.code;
        _code.clear();
      } else if (error.code == 'PHONE_TAKEN' || error.code == 'PHONE_UNCHANGED') {
        _fieldError = error.message;
      } else {
        _error = error.message;
      }
    });
    if (error == null) _countdown(result.resendAfterSeconds);
  }

  Future<void> _confirm() async {
    final code = _code.text.trim();
    if (_busy) return;
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _fieldError = 'Enter the 6-digit code');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _fieldError = null;
    });
    final verify = widget.mode == _PhoneMode.verify;
    final error = verify ? await widget.auth.verifyPhoneCode(code) : await widget.auth.confirmPhoneChange(code);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(verify ? 'Phone verified' : 'Phone number updated');
      return;
    }
    setState(() {
      _busy = false;
      _code.clear();
      if (error.code == 'OTP_INVALID') {
        _fieldError = error.message;
      } else {
        _error = error.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPhone = widget.auth.user?.phone != null;
    final verify = widget.mode == _PhoneMode.verify;
    final title = _step == _PhoneStep.code
        ? 'Enter the code'
        : hasPhone
            ? 'Change mobile number'
            : 'Add a mobile number';
    final subtitle = _step == _PhoneStep.number
        ? "We'll text a 6-digit code to the new number before saving it."
        : 'We sent a 6-digit code to ${formatPhone(_sentTo)}.';

    return Padding(
      padding: EdgeInsets.fromLTRB(Tokens.gutter, 0, Tokens.gutter, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(color: Tokens.inkMuted)),
            const SizedBox(height: 24),
            if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 16)],
            if (_step == _PhoneStep.number) ...[
              AppTextField(
                label: 'New mobile number',
                controller: _digits,
                hint: '98765 43210',
                prefix: '+91',
                inputFormatters: const [TenDigitFormatter()],
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                autofocus: true,
                errorText: _fieldError,
                onSubmitted: (_) => _send(),
              ),
              const SizedBox(height: 24),
              PrimaryButton(label: 'Send code', onPressed: _send, loading: _busy),
            ] else ...[
              OtpField(
                controller: _code,
                autofocus: true,
                errorText: _fieldError,
                onChanged: (value) {
                  if (_fieldError != null) setState(() => _fieldError = null);
                  if (value.length == 6) _confirm();
                },
                onSubmitted: (_) => _confirm(),
              ),
              if (!kReleaseMode)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text('Development mode: the code is always 123456.', style: TextStyle(color: Tokens.inkMuted)),
                ),
              const SizedBox(height: 24),
              PrimaryButton(label: verify ? 'Verify' : 'Verify and save', onPressed: _confirm, loading: _busy),
              const SizedBox(height: 8),
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  TextButton(
                    onPressed: _resendIn > 0 || _busy ? null : _send,
                    child: Text(_resendIn > 0 ? 'Resend code in ${_resendIn}s' : 'Resend code'),
                  ),
                  if (!verify)
                    TextButton(
                      onPressed: () => setState(() {
                        _timer?.cancel();
                        _step = _PhoneStep.number;
                        _error = null;
                        _fieldError = null;
                      }),
                      child: const Text('Change number'),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
