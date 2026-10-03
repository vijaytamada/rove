import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/api/health.dart';
import 'package:rove_app/main.dart';
import 'package:rove_app/screens/home_screen.dart';
import 'package:flutter/material.dart';
import 'package:rove_app/theme/app_theme.dart';

Widget _app(HealthFetcher fetcher) =>
    MaterialApp(theme: buildAppTheme(), home: HomeScreen(healthFetcher: fetcher));

void main() {
  testWidgets('shows backend up', (tester) async {
    await tester.pumpWidget(_app(() async =>
        const HealthReport(status: 'ok', database: 'up', redis: 'up')));
    await tester.pumpAndSettle();
    expect(find.text('All systems up'), findsOneWidget);
    expect(find.text('Up'), findsNWidgets(3));
  });

  testWidgets('shows unreachable when backend is down', (tester) async {
    await tester.pumpWidget(_app(() async => null));
    await tester.pumpAndSettle();
    expect(find.text('Unreachable'), findsOneWidget);
  });

  testWidgets('RoveApp builds', (tester) async {
    await tester.pumpWidget(const RoveApp());
    expect(find.byType(HomeScreen), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 6));
  });
}
