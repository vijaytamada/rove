import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:rove_app/main.dart';
import 'package:rove_app/screens/verify_screen.dart';

import 'test_helpers.dart';

/// A tiny fake of the identity check part of the API.
class FakeKyc {
  FakeKyc({this.status = 'NOT_STARTED', this.reason, this.attemptsLeft = 3});

  String status;
  String? reason;
  int attemptsLeft;

  /// What starting a check does next.
  String startResult = 'VERIFIED';

  Map<String, dynamic> get view => {'status': status, 'verifiedAt': null, 'rejectionReason': reason, 'attemptsLeft': attemptsLeft};

  Future<http.Response> handle(http.Request r) async {
    final path = r.url.path;
    if (path.endsWith('/auth/phone/request')) return codeSent();
    if (path.endsWith('/auth/phone/verify')) return authOk();
    if (path.endsWith('/kyc/status')) return json(200, view);
    if (path.endsWith('/kyc/start')) {
      status = startResult;
      return json(200, view);
    }
    if (path.endsWith('/notifications/unread-count')) return json(200, {'count': 0});
    if (path.endsWith('/dashboard/customer')) {
      return json(200, {'active': null, 'upcoming': null, 'recent': <Object>[], 'owed': null, 'stats': {'rides': 0, 'distanceKm': 0}});
    }
    if (path.endsWith('/me')) return json(200, userJson(phone: testPhone, phoneVerified: true));
    return json(404, {'statusCode': 404, 'code': 'NOT_FOUND', 'message': 'Not found.'});
  }
}

Future<TestEnv> openProfile(WidgetTester tester, FakeKyc kyc) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final env = TestEnv(kyc.handle);
  await env.auth.init();
  await tester.pumpWidget(RoveApp(auth: env.auth));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField), '9876543210');
  await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField), '123456');
  await tester.pumpAndSettle();
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Profile')));
  await tester.pumpAndSettle();
  return env;
}

/// Time passing in steps, so futures that finish in between get their screen rebuilt. (`pumpAndSettle` cannot be used
/// while the waiting screen's spinner is on screen: it never settles.)
Future<void> wait(WidgetTester tester, Duration total) async {
  for (var left = total; left > Duration.zero; left -= const Duration(milliseconds: 100)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('a check still being done shows as being checked, waits, and finishes by itself', (tester) async {
    final kyc = FakeKyc(status: 'PENDING');
    await openProfile(tester, kyc);
    expect(find.text('Being checked'), findsOneWidget);

    await tester.tap(find.text('See status'));
    await wait(tester, const Duration(seconds: 1));
    expect(find.text("We're checking your details"), findsOneWidget);
    expect(find.text('Verify me'), findsNothing);

    // The provider answers; the screen notices on its next look and closes.
    kyc.status = 'VERIFIED';
    await wait(tester, verifyPollInterval);
    await wait(tester, const Duration(seconds: 1));
    expect(find.text("We're checking your details"), findsNothing);
    expect(find.text('Verified'), findsNWidgets(2)); // the phone and the identity check
  });

  testWidgets('"Check again" looks at the status now', (tester) async {
    final kyc = FakeKyc(status: 'PENDING');
    final env = await openProfile(tester, kyc);
    await tester.tap(find.text('See status'));
    await wait(tester, const Duration(seconds: 1));
    final before = env.to('/kyc/status').length;
    await tester.tap(find.text('Check again'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(env.to('/kyc/status').length, before + 1);
    kyc.status = 'VERIFIED';
    await tester.tap(find.text('Check again'));
    await wait(tester, const Duration(seconds: 1));
    expect(find.text('Verified'), findsNWidgets(2)); // the phone and the identity check
  });

  testWidgets('starting a check that has to wait shows the waiting screen', (tester) async {
    final kyc = FakeKyc()..startResult = 'PENDING';
    await openProfile(tester, kyc);
    await tester.tap(find.text('Verify now'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    await tester.tap(find.widgetWithText(FilledButton, 'Verify me'));
    await wait(tester, const Duration(seconds: 1));
    expect(find.text("We're checking your details"), findsOneWidget);

    kyc.status = 'VERIFIED';
    await wait(tester, verifyPollInterval);
    await wait(tester, const Duration(seconds: 1));
    expect(find.text('Verified'), findsNWidgets(2)); // the phone and the identity check
  });

  testWidgets('a rejected check shows why, the tries left, and can be tried again', (tester) async {
    final kyc = FakeKyc(status: 'REJECTED', reason: 'The photo was blurry.', attemptsLeft: 2);
    final env = await openProfile(tester, kyc);
    expect(find.text('Not verified'), findsOneWidget);

    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text("We couldn't verify your identity"), findsOneWidget);
    expect(find.text('The photo was blurry.'), findsOneWidget);
    expect(find.text('You can try again. 2 tries left.'), findsOneWidget);

    // Consent is needed again.
    await tester.tap(find.widgetWithText(FilledButton, 'Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Please agree to continue.'), findsOneWidget);
    expect(env.to('/kyc/start'), isEmpty);

    await tester.tap(find.byType(Checkbox));
    await tester.tap(find.widgetWithText(FilledButton, 'Try again'));
    await tester.pumpAndSettle();
    expect(env.to('/kyc/start'), hasLength(1));
    expect(find.text('Verified'), findsNWidgets(2)); // the phone and the identity check
  });

  testWidgets('one try left is worded in the singular', (tester) async {
    await openProfile(tester, FakeKyc(status: 'REJECTED', reason: 'No match.', attemptsLeft: 1));
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('You can try again. 1 try left.'), findsOneWidget);
  });

  testWidgets('with no tries left the customer is told to contact support and cannot start again', (tester) async {
    final env = await openProfile(tester, FakeKyc(status: 'REJECTED', reason: 'No match.', attemptsLeft: 0));
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.textContaining('contact support'), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Try again'), findsNothing);
    expect(env.to('/kyc/start'), isEmpty);
  });
}
