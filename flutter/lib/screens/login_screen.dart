import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../theme/tokens.dart';
import '../widgets/app_text_field.dart';
import '../widgets/form_banner.dart';
import '../widgets/primary_button.dart';
import '../widgets/wordmark.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = AuthScope.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    final error = await auth.login(_email.text, _password.text);
    if (!mounted) return;
    // On success the app switches to the signed-in screens, so only failures need handling here.
    setState(() {
      _loading = false;
      _error = error?.message;
      if (error != null) _password.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: Tokens.gutter, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Wordmark(size: 28),
                    const SizedBox(height: 32),
                    Text('Welcome back', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    const Text('Sign in to book and manage your rides.', style: TextStyle(color: Tokens.inkMuted)),
                    const SizedBox(height: 28),
                    if (_error != null) ...[FormBanner.error(_error!), const SizedBox(height: 16)],
                    AppTextField(
                      label: 'Email',
                      controller: _email,
                      hint: 'name@company.com',
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      label: 'Password',
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                      validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                    ),
                    const SizedBox(height: 24),
                    PrimaryButton(label: 'Sign in', onPressed: _submit, loading: _loading),
                    const SizedBox(height: 12),
                    Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        const Text('New here?', style: TextStyle(color: Tokens.inkMuted)),
                        TextButton(
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(builder: (_) => const RegisterScreen()),
                          ),
                          child: const Text('Create an account'),
                        ),
                      ],
                    ),
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
