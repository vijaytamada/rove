import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../theme/tokens.dart';
import '../widgets/app_text_field.dart';
import '../widgets/form_banner.dart';
import '../widgets/primary_button.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  static const _fields = ['fullName', 'email', 'phone', 'password'];

  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = AuthScope.of(context);
    final navigator = Navigator.of(context);
    setState(() {
      _loading = true;
      _error = null;
      _fieldErrors = {};
    });
    final error = await auth.register(
      fullName: _name.text,
      email: _email.text,
      password: _password.text,
      phone: _phone.text,
    );
    if (!mounted) return;
    if (error == null) {
      // Signed in: close this screen so the signed-in home shows.
      navigator.popUntil((route) => route.isFirst);
      return;
    }
    final fieldErrors = error.fieldErrors(_fields);
    setState(() {
      _loading = false;
      _fieldErrors = fieldErrors;
      _error = fieldErrors.isEmpty ? (error.details.isNotEmpty ? error.details.first : error.message) : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: Tokens.gutter, vertical: 8),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Create your account',
                        style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    const Text('It takes a minute. Then pick a scooter and go.',
                        style: TextStyle(color: Tokens.inkMuted)),
                    const SizedBox(height: 24),
                    if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 16)],
                    AppTextField(
                      label: 'Full name',
                      controller: _name,
                      autofillHints: const [AutofillHints.name],
                      textInputAction: TextInputAction.next,
                      errorText: _fieldErrors['fullName'],
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      label: 'Email',
                      controller: _email,
                      hint: 'name@company.com',
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      errorText: _fieldErrors['email'],
                      validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      label: 'Phone (optional)',
                      controller: _phone,
                      hint: '+919876543210',
                      helper: "Include the country code. You'll verify it before your first booking.",
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      textInputAction: TextInputAction.next,
                      errorText: _fieldErrors['phone'],
                      validator: (v) {
                        final value = (v ?? '').replaceAll(RegExp(r'\s+'), '');
                        if (value.isEmpty || RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(value)) return null;
                        return 'Use international format, e.g. +919876543210';
                      },
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      label: 'Password',
                      controller: _password,
                      helper: 'At least 8 characters.',
                      obscureText: true,
                      autofillHints: const [AutofillHints.newPassword],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                      errorText: _fieldErrors['password'],
                      validator: (v) => (v == null || v.length < 8) ? 'Use at least 8 characters' : null,
                    ),
                    const SizedBox(height: 24),
                    PrimaryButton(label: 'Create account', onPressed: _submit, loading: _loading),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
