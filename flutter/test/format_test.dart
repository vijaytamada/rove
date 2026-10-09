import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/format.dart';

void main() {
  test('formatKm drops a pointless .0', () {
    expect(formatKm(6.0), '6');
    expect(formatKm(12.5), '12.5');
    expect(formatKm(0), '0');
  });

  group('formatMoney', () {
    test('shows whole rupees without decimals and uses Indian digit grouping', () {
      expect(formatMoney(0), '₹0');
      expect(formatMoney(4900), '₹49');
      expect(formatMoney(100000), '₹1,000');
      expect(formatMoney(10000000), '₹1,00,000');
      expect(formatMoney(123456700), '₹12,34,567');
      expect(formatMoney(99900), '₹999');
    });

    test('keeps paise when there are any', () {
      expect(formatMoney(10050), '₹100.50');
      expect(formatMoney(5), '₹0.05');
    });
  });

  group('city clock (India)', () {
    // 2026-10-09 04:30 UTC is 10:00 in India.
    final utc = DateTime.utc(2026, 10, 9, 4, 30);

    test('converts an instant to the city wall clock and back', () {
      final wall = toCityTime(utc, 'Asia/Kolkata');
      expect([wall.year, wall.month, wall.day, wall.hour, wall.minute], [2026, 10, 9, 10, 0]);
      expect(cityWallToUtc(wall, 'Asia/Kolkata'), utc);
    });

    test('rolls over midnight correctly', () {
      final wall = toCityTime(DateTime.utc(2026, 10, 8, 19, 0), 'Asia/Kolkata');
      expect([wall.day, wall.hour, wall.minute], [9, 0, 30]);
    });

    test('formats a time and a range, within a day and across days', () {
      expect(formatDateTime(utc, 'Asia/Kolkata'), 'Fri, 9 Oct, 10:00 am');
      expect(formatRange(utc, utc.add(const Duration(hours: 2)), 'Asia/Kolkata'), 'Fri, 9 Oct · 10:00 am – 12:00 pm');
      expect(
        formatRange(utc, utc.add(const Duration(hours: 24)), 'Asia/Kolkata'),
        'Fri, 9 Oct, 10:00 am – Sat, 10 Oct, 10:00 am',
      );
      expect(formatDateTime(DateTime.utc(2026, 10, 9, 6, 30), 'Asia/Kolkata'), 'Fri, 9 Oct, 12:00 pm');
      expect(formatDateTime(DateTime.utc(2026, 10, 9, 18, 30), 'Asia/Kolkata'), 'Sat, 10 Oct, 12:00 am');
    });
  });

  group('formatCountdown', () {
    final end = DateTime.utc(2026, 10, 9, 10, 10);
    test('counts down minutes and seconds, rounding partial seconds up', () {
      expect(formatCountdown(end, DateTime.utc(2026, 10, 9, 10, 0)), '10:00');
      expect(formatCountdown(end, DateTime.utc(2026, 10, 9, 10, 0, 18)), '9:42');
      expect(formatCountdown(end, DateTime.utc(2026, 10, 9, 10, 9, 59, 500)), '0:01');
    });

    test('stops at zero', () {
      expect(formatCountdown(end, end), '0:00');
      expect(formatCountdown(end, end.add(const Duration(minutes: 5))), '0:00');
    });
  });
}
