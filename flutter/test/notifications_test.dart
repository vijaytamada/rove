import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:rove_app/main.dart';
import 'package:rove_app/screens/notifications_screen.dart';

import 'test_helpers.dart';

Map<String, dynamic> note(
  String id, {
  String type = 'BOOKING_CONFIRMED',
  String title = 'Booking confirmed',
  String body = 'You are booked on BLR-001.',
  String? bookingId = 'b1',
  bool read = false,
  Duration age = const Duration(minutes: 5),
}) =>
    {
      'id': id,
      'type': type,
      'title': title,
      'body': body,
      'bookingId': bookingId,
      'readAt': read ? DateTime.now().toUtc().toIso8601String() : null,
      'createdAt': DateTime.now().toUtc().subtract(age).toIso8601String(),
    };

/// A tiny fake of the inbox part of the API.
class FakeInbox {
  FakeInbox(this.items);

  final List<Map<String, dynamic>> items;
  bool failList = false;

  int get unread => items.where((n) => n['readAt'] == null).length;

  Future<http.Response> handle(http.Request r) async {
    final path = r.url.path;
    if (path.endsWith('/auth/phone/request')) return codeSent();
    if (path.endsWith('/auth/phone/verify')) return authOk();
    if (path.endsWith('/dashboard/customer')) {
      return json(200, {
        'active': null,
        'upcoming': null,
        'recent': <Object>[],
        'owed': null,
        'stats': {'rides': 0, 'distanceKm': 0},
      });
    }
    if (path.endsWith('/notifications/unread-count')) return json(200, {'count': unread});
    if (path.endsWith('/notifications/read-all')) {
      for (final n in items) {
        n['readAt'] ??= DateTime.now().toUtc().toIso8601String();
      }
      return json(200, {'updated': 1});
    }
    final read = RegExp(r'/notifications/([^/]+)/read$').firstMatch(path);
    if (read != null) {
      final n = items.firstWhere((x) => x['id'] == read.group(1));
      n['readAt'] ??= DateTime.now().toUtc().toIso8601String();
      return json(200, n);
    }
    if (path.endsWith('/notifications')) {
      if (failList) return apiError(500, 'INTERNAL_ERROR', 'Something went wrong.');
      return json(200, {'items': items, 'total': items.length, 'page': 1, 'limit': 50});
    }
    return json(404, {'statusCode': 404, 'code': 'NOT_FOUND', 'message': 'Not found.'});
  }
}

Future<void> signIn(WidgetTester tester, TestEnv env) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await env.auth.init();
  await tester.pumpWidget(RoveApp(auth: env.auth));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField), '9876543210');
  await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField), '123456');
  await tester.pumpAndSettle();
}

Finder get bell => find.byIcon(Icons.notifications_none);

void main() {
  testWidgets('the bell shows how many messages are unread', (tester) async {
    final inbox = FakeInbox([note('n1'), note('n2', read: true), note('n3')]);
    await signIn(tester, TestEnv(inbox.handle));
    expect(find.descendant(of: find.byType(Badge), matching: find.text('2')), findsOneWidget);
    expect(find.byTooltip('Notifications, 2 unread'), findsOneWidget);
  });

  testWidgets('the bell has no badge when everything is read', (tester) async {
    final inbox = FakeInbox([note('n1', read: true)]);
    await signIn(tester, TestEnv(inbox.handle));
    expect(find.byTooltip('Notifications'), findsOneWidget);
    expect(find.descendant(of: find.byType(Badge), matching: find.byType(Text)), findsNothing);
  });

  testWidgets('shows the messages, newest first, with how long ago and a link to the booking', (tester) async {
    final inbox = FakeInbox([
      note('n1', title: 'Ride complete', body: 'No extra charges.', age: const Duration(minutes: 5)),
      note('n2', title: 'Booking confirmed', age: const Duration(hours: 3), read: true),
      note('n3', title: 'Pick-up soon', bookingId: null, age: const Duration(days: 4), read: true),
    ]);
    await signIn(tester, TestEnv(inbox.handle));
    await tester.tap(bell);
    await tester.pumpAndSettle();

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Ride complete'), findsOneWidget);
    expect(find.text('No extra charges.'), findsOneWidget);
    expect(find.text('5 min ago'), findsOneWidget);
    expect(find.text('3 h ago'), findsOneWidget);
    expect(find.text('View booking'), findsNWidgets(2)); // the third has no booking
    expect(find.byKey(unreadDotKey), findsOneWidget);
  });

  testWidgets('tapping a message marks it read on the server and the badge follows', (tester) async {
    final inbox = FakeInbox([note('n1', title: 'Ride complete', bookingId: null), note('n2')]);
    final env = TestEnv(inbox.handle);
    await signIn(tester, env);
    await tester.tap(bell);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Ride complete'));
    await tester.pumpAndSettle();
    expect(env.to('/notifications/n1/read'), hasLength(1));
    expect(env.to('/notifications/n2/read'), isEmpty);
    expect(find.byKey(unreadDotKey), findsOneWidget);

    // Back on home, the badge counts what is left.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Notifications, 1 unread'), findsOneWidget);
  });

  testWidgets('"Mark all as read" clears every unread message and then goes away', (tester) async {
    final inbox = FakeInbox([note('n1'), note('n2')]);
    final env = TestEnv(inbox.handle);
    await signIn(tester, env);
    await tester.tap(bell);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Mark all as read'));
    await tester.pumpAndSettle();
    expect(env.to('/notifications/read-all'), hasLength(1));
    expect(find.text('Mark all as read'), findsNothing);
    expect(find.byKey(unreadDotKey), findsNothing);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Notifications'), findsOneWidget);
  });

  testWidgets('an empty inbox says so', (tester) async {
    await signIn(tester, TestEnv(FakeInbox([]).handle));
    await tester.tap(bell);
    await tester.pumpAndSettle();
    expect(find.textContaining('Nothing yet'), findsOneWidget);
    expect(find.text('Mark all as read'), findsNothing);
  });

  testWidgets('a failed load offers to try again', (tester) async {
    final inbox = FakeInbox([note('n1')])..failList = true;
    await signIn(tester, TestEnv(inbox.handle));
    await tester.tap(bell);
    await tester.pumpAndSettle();
    expect(find.text('Something went wrong.'), findsOneWidget);

    inbox.failList = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Booking confirmed'), findsOneWidget);
  });
}
