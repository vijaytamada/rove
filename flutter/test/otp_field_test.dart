import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/widgets/otp_field.dart';

void main() {
  Future<TextEditingController> pump(WidgetTester tester, {String? error, ValueChanged<String>? onChanged}) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(20),
            child: OtpField(controller: controller, errorText: error, onChanged: onChanged),
          ),
        ),
      ),
    );
    return controller;
  }

  testWidgets('draws one box per digit and fills them as the code is typed', (tester) async {
    await pump(tester);
    expect(find.byType(Container), findsAtLeastNWidgets(6));

    await tester.enterText(find.byType(TextFormField), '123');
    await tester.pump();
    for (final digit in ['1', '2', '3']) {
      expect(find.text(digit), findsOneWidget);
    }
  });

  testWidgets('ignores non-digits and caps the code at six digits', (tester) async {
    final controller = await pump(tester);
    await tester.enterText(find.byType(TextFormField), '12ab3456789');
    await tester.pump();
    expect(controller.text, '123456');
  });

  testWidgets('reports changes and shows the error under the boxes', (tester) async {
    String? last;
    await pump(tester, error: 'That code is not right', onChanged: (v) => last = v);
    await tester.enterText(find.byType(TextFormField), '654321');
    expect(last, '654321');
    expect(find.text('That code is not right'), findsOneWidget);
  });
}
