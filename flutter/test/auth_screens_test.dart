import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
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

/// Types a number and the code (the form submits at 6 digits).
Future<void> signInThroughForm(WidgetTester tester) async {
  await tester.enterText(field('Mobile number'), '98765 43210');
  await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
  await tester.pumpAndSettle();
  await tester.enterText(field('Code'), '123456');
  await tester.pumpAndSettle();
}

Future<http.Response> phoneApi(http.Request r) async {
  final path = r.url.path;
  if (path.endsWith('/auth/phone/request')) return codeSent();
  if (path.endsWith('/auth/phone/verify')) return authOk();
  return json(500, {});
}

void main() {
  testWidgets('shows the phone step when signed out and rejects a bad number without calling the API', (tester) async {
    final env = TestEnv((r) async => json(500, {}));
    await pumpApp(tester, env);

    expect(find.text('Sign in or sign up'), findsOneWidget);
    await tester.enterText(field('Mobile number'), '12345');
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a valid mobile number, e.g. 98765 43210'), findsOneWidget);
    expect(env.requests, isEmpty);
  });

  testWidgets('a known number signs in with the code, submitting at 6 digits', (tester) async {
    final env = TestEnv(phoneApi);
    await pumpApp(tester, env);

    await tester.enterText(field('Mobile number'), '98765 43210');
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pumpAndSettle();

    expect(env.to('/auth/phone/request').single.body, contains('"phone":"+919876543210"'));
    expect(find.text('Enter the code'), findsOneWidget);
    expect(find.textContaining('+91 98765 43210'), findsOneWidget);

    await tester.enterText(field('Code'), '123456');
    await tester.pumpAndSettle();

    expect(env.to('/auth/phone/verify').single.body, contains('"code":"123456"'));
    expect(find.text('Hi, Asha'), findsOneWidget);
    expect(env.auth.status, AuthStatus.signedIn);
    expect(find.text('Profile'), findsOneWidget); // bottom navigation
  });

  testWidgets('a wrong code shows an error, clears the field and stays signed out', (tester) async {
    final env = TestEnv((r) async => r.url.path.endsWith('/auth/phone/verify')
        ? apiError(400, 'OTP_INVALID', "That code isn't right. Try again.")
        : codeSent());
    await pumpApp(tester, env);

    await signInThroughForm(tester);

    expect(find.text("That code isn't right. Try again."), findsOneWidget);
    expect(tester.widget<TextFormField>(field('Code')).controller!.text, isEmpty);
    expect(env.auth.status, AuthStatus.signedOut);
  });

  testWidgets('a new number asks for a name, then creates the account', (tester) async {
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/phone/request')) return codeSent();
      if (path.endsWith('/auth/phone/verify')) return needsName();
      if (path.endsWith('/auth/phone/signup')) {
        return authOk(user: userJson(name: 'Ravi Shah', phone: testPhone, phoneVerified: true));
      }
      return json(500, {});
    });
    await pumpApp(tester, env);

    await signInThroughForm(tester);
    expect(find.text('Almost there'), findsOneWidget);
    expect(env.auth.status, AuthStatus.signedOut);

    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your name'), findsOneWidget);
    expect(env.to('/auth/phone/signup'), isEmpty);

    await tester.enterText(field('Full name'), 'Ravi Shah');
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(env.to('/auth/phone/signup').single.body, contains('"signupToken":"signup-ticket-0123456789"'));
    expect(find.text('Hi, Ravi'), findsOneWidget);
  });

  testWidgets('an expired sign-up ticket sends the user back to the phone step', (tester) async {
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/phone/request')) return codeSent();
      if (path.endsWith('/auth/phone/verify')) return needsName();
      return apiError(400, 'SIGNUP_EXPIRED', 'This sign-up link has expired. Start again with your phone number.');
    });
    await pumpApp(tester, env);

    await signInThroughForm(tester);
    await tester.enterText(field('Full name'), 'Ravi');
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(find.text('Sign in or sign up'), findsOneWidget);
    expect(find.textContaining('has expired'), findsOneWidget);
  });

  testWidgets('shows the server error when a code cannot be sent', (tester) async {
    final env = TestEnv(
      (r) async => apiError(429, 'OTP_TOO_MANY_REQUESTS', 'Too many codes requested for this number. Try again in an hour.'),
    );
    await pumpApp(tester, env);

    await tester.enterText(field('Mobile number'), '9876543210');
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Too many codes requested'), findsOneWidget);
    expect(find.text('Sign in or sign up'), findsOneWidget); // still on the phone step
  });

  testWidgets('resend is locked during the countdown, then sends another code', (tester) async {
    final env = TestEnv(phoneApi);
    await pumpApp(tester, env);

    await tester.enterText(field('Mobile number'), '9876543210');
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Resend code in 30s'), findsOneWidget);

    await tester.pump(const Duration(seconds: 10));
    expect(find.text('Resend code in 20s'), findsOneWidget);
    await tester.tap(find.text('Resend code in 20s'), warnIfMissed: false);
    await tester.pump();
    expect(env.to('/auth/phone/request'), hasLength(1));

    await tester.pump(const Duration(seconds: 21));
    expect(find.text('Resend code'), findsOneWidget);
    await tester.tap(find.text('Resend code'));
    await tester.pumpAndSettle();
    expect(env.to('/auth/phone/request'), hasLength(2));
  });

  testWidgets('change number returns to the phone step', (tester) async {
    final env = TestEnv(phoneApi);
    await pumpApp(tester, env);

    await tester.enterText(field('Mobile number'), '9876543210');
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Change number'));
    await tester.pumpAndSettle();

    expect(find.text('Sign in or sign up'), findsOneWidget);
    expect(find.text('Enter the code'), findsNothing);
  });

  testWidgets('shows a retry screen instead of sign-in when the server is unreachable, then recovers', (tester) async {
    var down = true;
    final env = TestEnv((r) async => down ? throw Exception('offline') : json(200, userJson()));
    env.tokens
      ..access = 'a'
      ..refresh = 'r';
    await pumpApp(tester, env);

    expect(find.textContaining("Can't reach Rove"), findsOneWidget);
    expect(find.text('Sign in or sign up'), findsNothing);

    down = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Hi, Asha'), findsOneWidget);
  });

  testWidgets('profile shows the phone, verifies a changed number and signs out', (tester) async {
    var verified = false;
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/phone/request')) return codeSent();
      if (path.endsWith('/auth/phone/verify')) return authOk(user: userJson(phone: testPhone));
      if (path.endsWith('/auth/otp/send')) return json(200, {'expiresInSeconds': 300});
      if (path.endsWith('/auth/otp/verify')) {
        verified = true;
        return json(204, {});
      }
      if (path.endsWith('/auth/logout')) return json(204, {});
      return json(200, userJson(phone: testPhone, phoneVerified: verified));
    });
    await pumpApp(tester, env);
    await signInThroughForm(tester);

    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('+91 98765 43210'), findsOneWidget); // no email: the phone is shown
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
    expect(find.text('Sign in or sign up'), findsOneWidget);
    expect(env.auth.status, AuthStatus.signedOut);
  });
}
