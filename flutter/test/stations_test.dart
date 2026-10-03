import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/api/fleet_api.dart';
import 'package:rove_app/main.dart';

import 'test_helpers.dart';

Map<String, dynamic> station(String id, String name, int available, {String cityId = 'c1', bool hours = true}) => {
      'id': id,
      'cityId': cityId,
      'name': name,
      'address': '$name Road, Test City',
      'latitude': 12.9,
      'longitude': 77.6,
      'capacity': 10,
      'opensAt': hours ? '06:00' : null,
      'closesAt': hours ? '22:00' : null,
      'status': 'ACTIVE',
      'availableVehicles': available,
    };

Map<String, dynamic> scooter(String code, int battery) => {
      'id': 'v-$code',
      'code': code,
      'status': 'AVAILABLE',
      'batteryPercent': battery,
      'model': {
        'id': 'm1',
        'type': 'SCOOTER',
        'brand': 'Voltra',
        'name': 'V2',
        'rangeKm': 90,
        'topSpeedKmh': 45,
        'batteryCapacityWh': 2400,
        'isActive': true,
      },
    };

/// Signs in and opens the Stations tab.
Future<void> openStations(WidgetTester tester, TestEnv env) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await env.auth.init();
  await tester.pumpWidget(RoveApp(auth: env.auth));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField), '9876543210');
  await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField), '123456'); // submits at 6 digits
  await tester.pumpAndSettle();
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Stations')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('lists stations of the first city and opens a station with its scooters', (tester) async {
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/phone/request')) return codeSent();
      if (path.endsWith('/auth/phone/verify')) return authOk();
      if (path.endsWith('/cities')) {
        return json(200, [
          {'id': 'c1', 'name': 'Bengaluru', 'state': 'Karnataka', 'timezone': 'Asia/Kolkata', 'isActive': true},
          {'id': 'c2', 'name': 'Hyderabad', 'state': 'Telangana', 'timezone': 'Asia/Kolkata', 'isActive': true},
        ]);
      }
      if (path.endsWith('/cities/c1/stations')) {
        return json(200, [station('s1', 'Indiranagar', 3), station('s2', 'MG Road', 0, hours: false)]);
      }
      if (path.endsWith('/cities/c2/stations')) return json(200, [station('s3', 'HITEC City', 2, cityId: 'c2')]);
      if (path.endsWith('/stations/s1/vehicles')) return json(200, [scooter('BLR-001', 92), scooter('BLR-002', 85)]);
      return json(404, {});
    });
    await openStations(tester, env);

    expect(find.text('Bengaluru'), findsOneWidget);
    expect(find.text('Hyderabad'), findsOneWidget);
    expect(find.text('Indiranagar'), findsOneWidget);
    expect(find.text('3 available'), findsOneWidget);
    expect(find.text('None available'), findsOneWidget);
    expect(find.text('06:00 – 22:00'), findsOneWidget);
    expect(find.text('Open 24 hours'), findsOneWidget);

    // Switching city loads its stations.
    await tester.tap(find.text('Hyderabad'));
    await tester.pumpAndSettle();
    expect(find.text('HITEC City'), findsOneWidget);
    expect(find.text('Indiranagar'), findsNothing);

    await tester.tap(find.text('Bengaluru'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Indiranagar'));
    await tester.pumpAndSettle();

    expect(find.text('Available scooters (2)'), findsOneWidget);
    expect(find.text('Scooter BLR-001'), findsOneWidget);
    expect(find.text('92%'), findsOneWidget);
    expect(find.text('90 km'), findsNWidgets(2));
    expect(find.text('45 km/h'), findsNWidgets(2));
  });

  testWidgets('shows an empty message for a station without scooters', (tester) async {
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/phone/request')) return codeSent();
      if (path.endsWith('/auth/phone/verify')) return authOk();
      if (path.endsWith('/cities')) return json(200, [{'id': 'c1', 'name': 'Bengaluru', 'state': 'K'}]);
      if (path.endsWith('/stations')) return json(200, [station('s1', 'Indiranagar', 0)]);
      return json(200, <dynamic>[]);
    });
    await openStations(tester, env);
    await tester.tap(find.text('Indiranagar'));
    await tester.pumpAndSettle();
    expect(find.text('Available scooters (0)'), findsOneWidget);
    expect(find.textContaining('No scooters are available here'), findsOneWidget);
  });

  testWidgets('shows an error with retry when stations fail to load, then recovers', (tester) async {
    var fail = true;
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/phone/request')) return codeSent();
      if (path.endsWith('/auth/phone/verify')) return authOk();
      if (path.endsWith('/cities')) {
        return fail ? apiError(500, 'INTERNAL_ERROR', 'Something went wrong. Try again.') : json(200, [{'id': 'c1', 'name': 'Bengaluru', 'state': 'K'}]);
      }
      return json(200, [station('s1', 'Indiranagar', 1)]);
    });
    await openStations(tester, env);

    expect(find.text('Something went wrong. Try again.'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Indiranagar'), findsOneWidget);
  });

  testWidgets('shows a message when no city is open', (tester) async {
    final env = TestEnv((r) async {
      final path = r.url.path;
      if (path.endsWith('/auth/phone/request')) return codeSent();
      if (path.endsWith('/auth/phone/verify')) return authOk();
      return json(200, <dynamic>[]);
    });
    await openStations(tester, env);
    expect(find.textContaining('No cities are open yet'), findsOneWidget);
  });

  test('FleetApi parses lists and passes errors through', () async {
    final env = TestEnv((r) async => r.url.path.endsWith('/cities')
        ? json(200, [{'id': 'c1', 'name': 'Pune', 'state': 'Maharashtra'}])
        : apiError(404, 'STATION_NOT_FOUND', 'Station not found.'));
    final api = FleetApi(env.api);
    final (cities, cityError) = await api.cities();
    expect(cities?.single.name, 'Pune');
    expect(cityError, isNull);
    final (vehicles, error) = await api.vehicles('x');
    expect(vehicles, isNull);
    expect(error?.code, 'STATION_NOT_FOUND');
  });
}
