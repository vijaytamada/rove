import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:rove_app/main.dart';

import 'test_helpers.dart';

const _model = {
  'id': 'm1',
  'type': 'SCOOTER',
  'brand': 'Voltra',
  'name': 'V2',
  'rangeKm': 90,
  'topSpeedKmh': 45,
  'batteryCapacityWh': 2400,
  'isActive': true,
};

const _pricing = {
  'planId': 'p1',
  'hourlyRateAmount': 4900,
  'dailyRateAmount': 29900,
  'includedKmPerHour': 12,
  'extraKmRateAmount': 600,
  'graceMinutes': 15,
  'lateFeePerHourAmount': 9900,
  'depositAmount': 100000,
};

const _stationSummary = {
  'id': 's1',
  'name': 'Indiranagar',
  'address': '100 Feet Rd, Indiranagar',
  'latitude': 12.97,
  'longitude': 77.64,
  'opensAt': '06:00',
  'closesAt': '22:00',
  'cityName': 'Bengaluru',
  'timezone': 'Asia/Kolkata',
};

Map<String, dynamic> _scooter({bool pricing = true}) => {
      'id': 'v1',
      'code': 'BLR-001',
      'status': 'AVAILABLE',
      'batteryPercent': 92,
      'model': _model,
      'pricing': pricing ? _pricing : null,
    };

Map<String, dynamic> bookingJson({
  String id = 'b1',
  String status = 'PENDING_PAYMENT',
  int hours = 2,
  String? pin,
  Map<String, dynamic>? cancellation,
  int refunded = 0,
  DateTime? start,
  DateTime? holdExpiresAt,
}) {
  final s = start ?? DateTime.now().toUtc().add(const Duration(minutes: 5));
  return {
    'id': id,
    'code': 'RV-K7M2Q9',
    'status': status,
    'startAt': s.toIso8601String(),
    'endAt': s.add(Duration(hours: hours)).toIso8601String(),
    'hours': hours,
    'holdExpiresAt': status == 'PENDING_PAYMENT'
        ? (holdExpiresAt ?? DateTime.now().toUtc().add(const Duration(minutes: 10))).toIso8601String()
        : null,
    'confirmedAt': status == 'CONFIRMED' ? DateTime.now().toUtc().toIso8601String() : null,
    'cancelledAt': status == 'CANCELLED' ? DateTime.now().toUtc().toIso8601String() : null,
    'createdAt': DateTime.now().toUtc().toIso8601String(),
    'rentalAmount': 9800,
    'depositAmount': 100000,
    'totalAmount': 109800,
    'pricing': _pricing,
    'includedKm': 24,
    'pin': pin,
    'vehicle': {'id': 'v1', 'code': 'BLR-001', 'model': _model},
    'station': _stationSummary,
    'payment': null,
    'refundedAmount': refunded,
    'cancellation': cancellation ?? {'allowed': status == 'PENDING_PAYMENT', 'refundAmount': 0, 'retainedAmount': 0},
  };
}

Map<String, dynamic> quoteJson({int hours = 2, String? startAt}) {
  final start = startAt == null ? DateTime.now().toUtc() : DateTime.parse(startAt);
  return {
    'hours': hours,
    'rentalAmount': hours * 4900,
    'depositAmount': 100000,
    'totalAmount': hours * 4900 + 100000,
    'includedKm': hours * 12,
    'startAt': start.toIso8601String(),
    'endAt': start.add(Duration(hours: hours)).toIso8601String(),
    'pricing': _pricing,
    'holdMinutes': 10,
  };
}

/// A small fake of the booking part of the API. Tests change its fields to steer the flow.
class FakeBackend {
  bool kycVerified = false;
  bool failNextPayment = false;
  bool stationOpen = true;
  Map<String, dynamic>? quoteError;
  final bookings = <String, Map<String, dynamic>>{};
  String? lastCreateBody;
  String? lastQuoteBody;
  Map<String, String>? lastPayHeaders;
  String? lastPayBody;

  Future<http.Response> handle(http.Request r) async {
    final path = r.url.path;
    if (path.endsWith('/auth/phone/request')) return codeSent();
    if (path.endsWith('/auth/phone/verify')) return authOk();
    if (path.endsWith('/cities')) {
      return json(200, [
        {'id': 'c1', 'name': 'Bengaluru', 'state': 'Karnataka', 'timezone': 'Asia/Kolkata', 'isActive': true},
      ]);
    }
    if (path.endsWith('/cities/c1/stations')) {
      return json(200, [
        {..._stationSummary, 'cityId': 'c1', 'capacity': 10, 'status': 'ACTIVE', 'availableVehicles': 2, 'openNow': stationOpen},
      ]);
    }
    if (path.endsWith('/stations/s1/vehicles')) return json(200, [_scooter()]);
    if (path.endsWith('/vehicles/v1')) return json(200, {'vehicle': _scooter(), 'station': _stationSummary});
    if (path.endsWith('/bookings/quote')) {
      lastQuoteBody = r.body;
      if (quoteError != null) return json(409, quoteError!);
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      return json(200, quoteJson(hours: body['hours'] as int, startAt: body['startAt'] as String?));
    }
    if (path.endsWith('/kyc/status')) return json(200, {'status': kycVerified ? 'VERIFIED' : 'NOT_STARTED'});
    if (path.endsWith('/kyc/start')) {
      kycVerified = true;
      return json(200, {'status': 'VERIFIED'});
    }
    if (path.endsWith('/bookings') && r.method == 'POST') {
      lastCreateBody = r.body;
      final b = bookingJson();
      bookings[b['id'] as String] = b;
      return json(201, b);
    }
    if (path.endsWith('/bookings') && r.method == 'GET') {
      final tab = r.url.queryParameters['tab'];
      final wanted = switch (tab) {
        'active' => ['PENDING_PAYMENT'],
        'upcoming' => ['CONFIRMED'],
        _ => ['CANCELLED', 'EXPIRED'],
      };
      final items = bookings.values.where((b) => wanted.contains(b['status'])).toList();
      return json(200, {'items': items, 'total': items.length, 'page': 1, 'limit': 50});
    }
    final pay = RegExp(r'/bookings/([^/]+)/pay$').firstMatch(path);
    if (pay != null) {
      lastPayHeaders = r.headers;
      lastPayBody = r.body;
      if (failNextPayment) {
        failNextPayment = false;
        return apiError(402, 'PAYMENT_FAILED', 'Payment was declined (simulated).');
      }
      final b = bookingJson(
        id: pay.group(1)!,
        status: 'CONFIRMED',
        pin: '482913',
        cancellation: {'allowed': true, 'refundAmount': 109800, 'retainedAmount': 0},
      );
      bookings[b['id'] as String] = b;
      return json(200, b);
    }
    final cancel = RegExp(r'/bookings/([^/]+)/cancel$').firstMatch(path);
    if (cancel != null) {
      final b = bookingJson(id: cancel.group(1)!, status: 'CANCELLED', refunded: 109800);
      bookings[b['id'] as String] = b;
      return json(200, b);
    }
    final one = RegExp(r'/bookings/([^/]+)$').firstMatch(path);
    if (one != null && bookings[one.group(1)] != null) return json(200, bookings[one.group(1)]!);
    if (path.endsWith('/me')) return json(200, userJson(phone: testPhone, phoneVerified: true));
    return json(404, {'statusCode': 404, 'code': 'NOT_FOUND', 'message': 'Not found.'});
  }
}

Future<void> signInAndOpen(WidgetTester tester, TestEnv env) async {
  // Tall on purpose: lists only build what is on screen, and these screens are long.
  tester.view.physicalSize = const Size(1080, 6000);
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

Future<void> openTab(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)));
  await tester.pumpAndSettle();
}

/// Home -> Stations -> Indiranagar -> Select on the first scooter.
Future<void> openBookScreen(WidgetTester tester) async {
  await openTab(tester, 'Stations');
  await tester.tap(find.text('Indiranagar'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Select'));
  await tester.pumpAndSettle();
  // The price is requested after a short pause.
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a closed station says so instead of counting scooters, and still allows booking later', (tester) async {
    final env = TestEnv((FakeBackend()..stationOpen = false).handle);
    await signInAndOpen(tester, env);
    await openTab(tester, 'Stations');
    expect(find.text('Closed now'), findsOneWidget);
    expect(find.text('2 available'), findsNothing);
    await tester.tap(find.text('Indiranagar'));
    await tester.pumpAndSettle();
    expect(find.textContaining('closed right now'), findsOneWidget);
    expect(find.text('Select'), findsOneWidget);
  });

  testWidgets('a city picked for you is a plain label, not a button', (tester) async {
    final env = TestEnv(FakeBackend().handle);
    await signInAndOpen(tester, env);
    await openTab(tester, 'Stations');
    expect(find.text('Bengaluru, Karnataka'), findsOneWidget);
    expect(find.byIcon(Icons.expand_more), findsNothing);
  });

  testWidgets('station list shows the hourly price and Select opens the booking screen with live prices', (tester) async {
    final env = TestEnv(FakeBackend().handle);
    await signInAndOpen(tester, env);
    await openTab(tester, 'Stations');
    await tester.tap(find.text('Indiranagar'));
    await tester.pumpAndSettle();
    expect(find.text('Available now (1)'), findsOneWidget);
    expect(find.textContaining('₹49 / hour', findRichText: true), findsOneWidget);

    await tester.tap(find.text('Select'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    expect(find.text('Rates and rules'), findsOneWidget);
    expect(find.textContaining('₹49 per hour, never more than ₹299 for a day', findRichText: true), findsOneWidget);
    expect(find.text('Rental · 2 hours'), findsOneWidget);
    expect(find.text('₹98'), findsOneWidget);
    expect(find.text('₹1,000'), findsOneWidget);
    expect(find.text('₹1,098'), findsWidgets);

    // Another duration asks the backend again; the app never works out money itself.
    await tester.tap(find.text('4 hours'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('₹196'), findsOneWidget);
    expect(find.text('₹1,196'), findsWidgets);
  });

  testWidgets('first booking goes through the identity check, then payment, then shows code and PIN', (tester) async {
    final backend = FakeBackend();
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);
    await openBookScreen(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Verify your identity'), findsWidgets);

    // Consent is required.
    await tester.tap(find.widgetWithText(FilledButton, 'Verify me'));
    await tester.pumpAndSettle();
    expect(find.text('Please agree to continue.'), findsOneWidget);
    expect(env.to('/kyc/start'), isEmpty);

    await tester.tap(find.byType(Checkbox));
    await tester.tap(find.widgetWithText(FilledButton, 'Verify me'));
    await tester.pumpAndSettle();

    // Back on the booking flow: the scooter is held and checkout opens.
    expect(backend.lastCreateBody, contains('"vehicleId":"v1"'));
    expect(backend.lastCreateBody, contains('"hours":2'));
    expect(backend.lastCreateBody, isNot(contains('startAt')));
    expect(find.text('Pay to confirm'), findsOneWidget);
    expect(find.text('Pay ₹1,098'), findsOneWidget);
    expect(find.text('10:00'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Pay ₹1,098'));
    await tester.pumpAndSettle();

    expect(find.text('Booking confirmed. Show your booking code and PIN at the station to pick up the scooter.'), findsOneWidget);
    expect(find.text('RV-K7M2Q9'), findsWidgets);
    expect(find.text('482913'), findsOneWidget);
    expect(find.text('Cancel booking'), findsOneWidget);
    expect(backend.lastPayHeaders?['Idempotency-Key'], isNotNull);
    expect(backend.lastPayHeaders!['Idempotency-Key']!.length, greaterThanOrEqualTo(8));
  });

  testWidgets('a verified customer goes straight to payment', (tester) async {
    final backend = FakeBackend()..kycVerified = true;
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);
    await openBookScreen(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Pay to confirm'), findsOneWidget);
    expect(env.to('/kyc/start'), isEmpty);
  });

  testWidgets('a failed payment keeps the hold and can be retried', (tester) async {
    final backend = FakeBackend()
      ..kycVerified = true
      ..failNextPayment = true;
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);
    await openBookScreen(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Pay ₹1,098'));
    await tester.pumpAndSettle();
    expect(find.text('Payment was declined (simulated).'), findsOneWidget);
    expect(find.text('Pay to confirm'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Pay ₹1,098'));
    await tester.pumpAndSettle();
    expect(find.text('482913'), findsOneWidget);
  });

  testWidgets('the demo checkbox asks the backend for a simulated failure', (tester) async {
    final backend = FakeBackend()..kycVerified = true;
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);
    await openBookScreen(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Pay ₹1,098'));
    await tester.pumpAndSettle();
    expect(backend.lastPayBody, contains('"simulate":"FAIL"'));
  });

  testWidgets('an expired hold disables Pay and offers to book again', (tester) async {
    final backend = FakeBackend()..kycVerified = true;
    final env = TestEnv((r) async {
      if (r.url.path.endsWith('/pay')) {
        return apiError(409, 'HOLD_EXPIRED', 'Your hold on this scooter ran out. Book it again.');
      }
      return backend.handle(r);
    });
    await signInAndOpen(tester, env);
    await openBookScreen(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Pay ₹1,098'));
    await tester.pumpAndSettle();

    expect(find.text('Your hold on this scooter ran out. Book it again.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Pay ₹1,098')).onPressed, isNull);
    await tester.tap(find.text('Book it again'));
    await tester.pumpAndSettle();
    expect(find.text('Rates and rules'), findsOneWidget);
  });

  testWidgets('an unavailable slot shows the backend message and blocks Continue', (tester) async {
    final backend = FakeBackend()
      ..quoteError = {'statusCode': 409, 'code': 'STATION_CLOSED', 'message': 'Indiranagar is closed at that time. It is open 06:00 to 22:00.'};
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);
    await openBookScreen(tester);
    expect(find.text('Indiranagar is closed at that time. It is open 06:00 to 22:00.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Continue')).onPressed, isNull);
  });

  testWidgets('"Pick a time" sends the chosen start to the backend', (tester) async {
    final backend = FakeBackend()..kycVerified = true;
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);
    await openBookScreen(tester);
    expect(backend.lastQuoteBody, isNot(contains('startAt')));

    await tester.tap(find.text('Pick a time'));
    await tester.pumpAndSettle();
    expect(find.text('Pickup date'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Pickup time'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    expect(backend.lastQuoteBody, contains('startAt'));
    expect(find.textContaining('Times are in Bengaluru time'), findsOneWidget);
  });

  testWidgets('My bookings sorts into tabs, opens a booking and cancels it with a refund preview', (tester) async {
    final backend = FakeBackend()..kycVerified = true;
    backend.bookings['b1'] = bookingJson(
      id: 'b1',
      status: 'CONFIRMED',
      pin: '482913',
      cancellation: {'allowed': true, 'refundAmount': 109800, 'retainedAmount': 0},
    );
    backend.bookings['b2'] = bookingJson(id: 'b2', status: 'PENDING_PAYMENT');
    backend.bookings['b3'] = bookingJson(id: 'b3', status: 'CANCELLED', refunded: 109800);
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);

    // Home shows the booking that needs attention.
    expect(find.text('Finish your booking'), findsOneWidget);

    await openTab(tester, 'Bookings');
    expect(find.text('Waiting for payment'), findsOneWidget);
    expect(find.text('Pay now'), findsOneWidget);

    await tester.tap(find.text('Upcoming'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmed'), findsOneWidget);
    await tester.tap(find.text('Past'));
    await tester.pumpAndSettle();
    expect(find.text('Cancelled'), findsOneWidget);

    await tester.tap(find.text('Upcoming'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmed'));
    await tester.pumpAndSettle();
    expect(find.text('482913'), findsOneWidget);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel booking'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel this booking?'), findsOneWidget);
    expect(find.textContaining('back to your original payment method'), findsOneWidget);
    expect(find.textContaining('₹1,098'), findsWidgets);

    await tester.tap(find.widgetWithText(FilledButton, 'Cancel booking'));
    await tester.pumpAndSettle();
    expect(env.to('/cancel'), hasLength(1));
    expect(find.textContaining('is on its way back to you'), findsOneWidget);
  });

  testWidgets('a late cancellation says the rental is kept', (tester) async {
    final backend = FakeBackend()..kycVerified = true;
    backend.bookings['b1'] = bookingJson(
      id: 'b1',
      status: 'CONFIRMED',
      pin: '482913',
      cancellation: {'allowed': true, 'refundAmount': 100000, 'retainedAmount': 9800},
    );
    final env = TestEnv(backend.handle);
    await signInAndOpen(tester, env);
    await openTab(tester, 'Bookings');
    await tester.tap(find.text('Upcoming'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmed'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel booking'));
    await tester.pumpAndSettle();
    expect(find.textContaining("The ₹98 rental charge isn't refunded"), findsOneWidget);
    await tester.tap(find.text('Keep booking'));
    await tester.pumpAndSettle();
    expect(env.to('/cancel'), isEmpty);
  });

  testWidgets('empty bookings point to the stations', (tester) async {
    final env = TestEnv(FakeBackend().handle);
    await signInAndOpen(tester, env);
    await openTab(tester, 'Bookings');
    expect(find.text('Nothing active right now.'), findsOneWidget);
    await tester.tap(find.text('Find a scooter'));
    await tester.pumpAndSettle();
    expect(find.text('Stations'), findsWidgets);
    expect(find.text('Indiranagar'), findsOneWidget);
  });
}
