import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:rove_app/auth/auth_controller.dart';
import 'package:rove_app/main.dart';
import 'package:rove_app/widgets/app_text_field.dart';
import 'package:rove_app/widgets/otp_field.dart';

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
      of: find.ancestor(of: find.text(label), matching: find.byWidgetPredicate((w) => w is AppTextField || w is OtpField)),
      matching: find.byType(TextFormField),
    );

/// Types a number and the code (the form submits at 6 digits).
Future<void> signInThroughForm(WidgetTester tester) async {
  await tester.enterText(field('Mobile number'), '98765 43210');
  await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
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

    expect(find.text("Let's get you riding"), findsOneWidget);
    expect(find.text('+91'), findsOneWidget);
    await tester.enterText(field('Mobile number'), '12345');
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Enter your 10-digit mobile number'), findsOneWidget);
    expect(env.requests, isEmpty);
  });

  testWidgets('a known number signs in with the code, submitting at 6 digits', (tester) async {
    final env = TestEnv(phoneApi);
    await pumpApp(tester, env);

    await tester.enterText(field('Mobile number'), '98765 43210');
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
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
    expect(find.text("What's your name?"), findsOneWidget);
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

    expect(find.text("Let's get you riding"), findsOneWidget);
    expect(find.textContaining('has expired'), findsOneWidget);
  });

  testWidgets('shows the server error when a code cannot be sent', (tester) async {
    final env = TestEnv(
      (r) async => apiError(429, 'OTP_TOO_MANY_REQUESTS', 'Too many codes requested for this number. Try again in an hour.'),
    );
    await pumpApp(tester, env);

    await tester.enterText(field('Mobile number'), '9876543210');
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Too many codes requested'), findsOneWidget);
    expect(find.text("Let's get you riding"), findsOneWidget); // still on the phone step
  });

  testWidgets('resend is locked during the countdown, then sends another code', (tester) async {
    final env = TestEnv(phoneApi);
    await pumpApp(tester, env);

    await tester.enterText(field('Mobile number'), '9876543210');
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
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
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Change number'));
    await tester.pumpAndSettle();

    expect(find.text("Let's get you riding"), findsOneWidget);
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
    expect(find.text("Let's get you riding"), findsNothing);

    down = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Hi, Asha'), findsOneWidget);
  });

  group('profile', () {
    const newPhone = '+919876500001';

    /// Signs in and opens the profile. `me` is what GET /me answers with; `extra` can override any route.
    Future<TestEnv> openProfile(WidgetTester tester, Map<String, dynamic> Function() me, {Future<http.Response?> Function(http.Request)? extra}) async {
      final env = TestEnv((r) async {
        final path = r.url.path;
        final custom = await extra?.call(r);
        if (custom != null) return custom;
        if (path.endsWith('/auth/phone/request')) return codeSent();
        if (path.endsWith('/auth/phone/verify')) return authOk(user: me());
        if (path.endsWith('/auth/logout')) return json(204, {});
        return json(200, me());
      });
      await pumpApp(tester, env);
      await signInThroughForm(tester);
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      return env;
    }

    testWidgets('shows details read-only, with an edit pencil instead of boxes', (tester) async {
      await openProfile(tester, () => userJson(phone: testPhone, phoneVerified: true));
      expect(find.text('Asha Kumar'), findsWidgets);
      expect(find.text('+91 98765 43210'), findsWidgets);
      expect(find.text('Verified'), findsOneWidget);
      expect(find.byType(TextFormField), findsNothing);
      expect(find.byTooltip('Edit full name'), findsOneWidget);
      expect(find.byTooltip('Change mobile number'), findsOneWidget);
    });

    testWidgets('the name edits in place: pencil, type, save', (tester) async {
      var name = 'Asha Kumar';
      final env = await openProfile(
        tester,
        () => userJson(name: name, phone: testPhone, phoneVerified: true),
        extra: (r) async {
          if (r.method == 'PATCH' && r.url.path.endsWith('/me')) {
            name = 'Asha K';
            return json(200, userJson(name: name, phone: testPhone, phoneVerified: true));
          }
          return null;
        },
      );

      await tester.tap(find.byTooltip('Edit full name'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(FilledButton, 'Save'), findsOneWidget);

      await tester.enterText(field('Full name'), 'Asha K');
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();

      final patch = env.to('/me').where((r) => r.method == 'PATCH').single;
      expect(patch.body, contains('"fullName":"Asha K"'));
      expect(patch.body, isNot(contains('phone')));
      expect(find.text('Name updated'), findsOneWidget);
      expect(find.byType(TextFormField), findsNothing);
    });

    testWidgets('a new phone number is saved only after its code is confirmed', (tester) async {
      var phone = testPhone;
      final env = await openProfile(
        tester,
        () => userJson(phone: phone, phoneVerified: true),
        extra: (r) async {
          final path = r.url.path;
          if (path.endsWith('/auth/phone/change')) return codeSent();
          if (path.endsWith('/auth/phone/change/verify')) {
            phone = newPhone;
            return json(204, {});
          }
          return null;
        },
      );

      await tester.tap(find.byTooltip('Change mobile number'));
      await tester.pumpAndSettle();
      expect(find.text('Change mobile number'), findsOneWidget); // sheet title

      await tester.enterText(field('New mobile number'), '98765 00001');
      await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
      await tester.pumpAndSettle();
      expect(env.to('/auth/phone/change').single.body, contains('"phone":"$newPhone"'));
      expect(env.to('/auth/phone/change/verify'), isEmpty);
      expect(find.text('We sent a 6-digit code to +91 98765 00001.'), findsOneWidget);
      expect(env.auth.user?.phone, testPhone); // nothing saved yet

      await tester.enterText(field('Code'), '123456');
      await tester.pumpAndSettle();

      expect(env.to('/auth/phone/change/verify').single.body, contains('"code":"123456"'));
      expect(env.auth.user?.phone, newPhone);
      expect(find.text('Phone number updated'), findsOneWidget);
      expect(find.text('+91 98765 00001'), findsWidgets);
    });

    testWidgets('a wrong code keeps the old number and clears the boxes', (tester) async {
      final env = await openProfile(
        tester,
        () => userJson(phone: testPhone, phoneVerified: true),
        extra: (r) async {
          final path = r.url.path;
          if (path.endsWith('/auth/phone/change')) return codeSent();
          if (path.endsWith('/auth/phone/change/verify')) {
            return apiError(400, 'OTP_INVALID', "That code isn't right. Try again.");
          }
          return null;
        },
      );
      await tester.tap(find.byTooltip('Change mobile number'));
      await tester.pumpAndSettle();
      await tester.enterText(field('New mobile number'), '9876500001');
      await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
      await tester.pumpAndSettle();
      await tester.enterText(field('Code'), '000000');
      await tester.pumpAndSettle();

      expect(find.text("That code isn't right. Try again."), findsOneWidget);
      expect(tester.widget<TextFormField>(field('Code')).controller!.text, isEmpty);
      expect(env.auth.user?.phone, testPhone);
    });

    testWidgets('a number someone else uses is rejected before any code is sent', (tester) async {
      final env = await openProfile(
        tester,
        () => userJson(phone: testPhone, phoneVerified: true),
        extra: (r) async {
          if (r.url.path.endsWith('/auth/phone/change')) {
            return apiError(409, 'PHONE_TAKEN', 'An account with this phone number already exists.');
          }
          return null;
        },
      );
      await tester.tap(find.byTooltip('Change mobile number'));
      await tester.pumpAndSettle();
      await tester.enterText(field('New mobile number'), '9876500001');
      await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
      await tester.pumpAndSettle();

      expect(find.text('An account with this phone number already exists.'), findsOneWidget);
      expect(find.text('Enter the code'), findsNothing);
      expect(env.to('/auth/phone/change/verify'), isEmpty);
    });

    testWidgets('"Verify now" texts the saved number and verifies it', (tester) async {
      var verified = false;
      final env = await openProfile(
        tester,
        () => userJson(phone: testPhone, phoneVerified: verified),
        extra: (r) async {
          final path = r.url.path;
          if (path.endsWith('/auth/otp/send')) return codeSent();
          if (path.endsWith('/auth/otp/verify')) {
            verified = true;
            return json(204, {});
          }
          return null;
        },
      );
      expect(find.text('Not verified'), findsOneWidget);

      await tester.tap(find.text('Verify now'));
      await tester.pumpAndSettle();
      expect(env.to('/auth/otp/send'), hasLength(1));
      expect(find.text('We sent a 6-digit code to +91 98765 43210.'), findsOneWidget);

      await tester.enterText(field('Code'), '123456');
      await tester.pumpAndSettle();
      expect(env.to('/auth/otp/verify').single.body, contains('"code":"123456"'));
      expect(find.text('Verified'), findsOneWidget);
      expect(find.text('Not verified'), findsNothing);
    });

    testWidgets('signs out', (tester) async {
      final env = await openProfile(tester, () => userJson(phone: testPhone, phoneVerified: true));
      await tester.scrollUntilVisible(find.text('Sign out'), 200, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(find.text("Let's get you riding"), findsOneWidget);
      expect(env.auth.status, AuthStatus.signedOut);
    });
  });
}
