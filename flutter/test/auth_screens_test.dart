import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/auth/auth_controller.dart';
import 'package:rove_app/main.dart';
import 'package:rove_app/widgets/app_text_field.dart';

import 'test_helpers.dart';

Future<void> pumpApp(WidgetTester tester, TestEnv env) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await env.auth.init();
  await tester.pumpWidget(RoveApp(auth: env.auth));
  await tester.pumpAndSettle();
}

/// The text input under a label (labels are rendered above the field, not inside it).
Finder field(String label) => find.descendant(
      of: find.ancestor(of: find.text(label), matching: find.byType(AppTextField)),
      matching: find.byType(TextFormField),
    );

void main() {
  testWidgets('shows the sign-in screen when signed out and validates empty input', (tester) async {
    final env = TestEnv((r) async => json(500, {}));
    await pumpApp(tester, env);

    expect(find.text('Welcome back'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a valid email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
    expect(env.requests, isEmpty);
  });

  testWidgets('signs in and shows the signed-in home', (tester) async {
    final env = TestEnv((r) async => authOk());
    await pumpApp(tester, env);

    await tester.enterText(find.byType(TextFormField).at(0), 'asha@example.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'secret-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Hi, Asha'), findsOneWidget);
    expect(env.auth.status, AuthStatus.signedIn);
    expect(find.text('Profile'), findsOneWidget); // bottom navigation
  });

  testWidgets('shows the server error and clears the password on a failed sign-in', (tester) async {
    final env = TestEnv((r) async => apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'));
    await pumpApp(tester, env);

    await tester.enterText(find.byType(TextFormField).at(0), 'asha@example.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'wrong-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Email or password is incorrect.'), findsOneWidget);
    expect(find.text('asha@example.com'), findsOneWidget); // email kept
    expect(find.text('wrong-pass'), findsNothing);
    expect(env.auth.status, AuthStatus.signedOut);
  });

  testWidgets('registers a new account', (tester) async {
    final env = TestEnv((r) async => authOk(user: userJson(name: 'Ravi Shah')));
    await pumpApp(tester, env);

    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();
    expect(find.text('Create your account'), findsOneWidget);

    await tester.enterText(field('Full name'), 'Ravi Shah');
    await tester.enterText(field('Email'), 'ravi@example.com');
    await tester.enterText(field('Password'), 'secret-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(find.text('Hi, Ravi'), findsOneWidget);
    expect(find.text('Create your account'), findsNothing);
  });

  testWidgets('validates registration input before calling the API', (tester) async {
    final env = TestEnv((r) async => authOk());
    await pumpApp(tester, env);

    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Full name'), 'Ravi');
    await tester.enterText(field('Email'), 'ravi@example.com');
    await tester.enterText(field('Phone (optional)'), '12345');
    await tester.enterText(field('Password'), 'short');
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(find.text('Use at least 8 characters'), findsOneWidget);
    expect(find.text('Use international format, e.g. +919876543210'), findsOneWidget);
    expect(env.requests, isEmpty);
  });

  testWidgets('shows a taken email as a field error', (tester) async {
    final env = TestEnv((r) async => apiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.'));
    await pumpApp(tester, env);

    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Full name'), 'Ravi');
    await tester.enterText(field('Email'), 'ravi@example.com');
    await tester.enterText(field('Password'), 'secret-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(find.text('An account with this email already exists.'), findsOneWidget);
    expect(env.auth.status, AuthStatus.signedOut);
  });

  testWidgets('profile verifies the phone and signs out', (tester) async {
    var verified = false;
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/login')) return authOk(user: userJson(phone: '+919876543210'));
      if (path.endsWith('/auth/otp/send')) return json(200, {'expiresInSeconds': 300});
      if (path.endsWith('/auth/otp/verify')) {
        verified = true;
        return json(204, {});
      }
      if (path.endsWith('/auth/logout')) return json(204, {});
      return json(200, userJson(phone: '+919876543210', phoneVerified: verified));
    });
    await pumpApp(tester, env);
    await tester.enterText(find.byType(TextFormField).at(0), 'asha@example.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'secret-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Phone not verified'), findsOneWidget);

    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();
    expect(find.text('Resend code'), findsOneWidget);

    await tester.enterText(field('Code'), '123456');
    await tester.tap(find.widgetWithText(FilledButton, 'Verify'));
    await tester.pumpAndSettle();
    expect(find.text('Phone verified'), findsOneWidget);
    expect(find.text('Verify your phone'), findsNothing);

    await tester.scrollUntilVisible(find.text('Sign out'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(env.auth.status, AuthStatus.signedOut);
  });
}
