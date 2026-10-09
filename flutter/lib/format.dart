// Display helpers. Money is integer paise from the API; this is the only place it becomes text.
// Times are shown on the city's clock (a pickup happens at a station), like on the website.

/// 6.0 -> "6", 12.5 -> "12.5": a distance without a pointless ".0", like the website.
String formatKm(double km) => km == km.roundToDouble() ? km.toInt().toString() : km.toString();

/// 4900 -> "₹49", 10050 -> "₹100.50", 10000000 -> "₹1,00,000" (Indian digit grouping).
String formatMoney(int paise) {
  final negative = paise < 0;
  final abs = paise.abs();
  final rupees = abs ~/ 100;
  final rest = abs % 100;
  final digits = rupees.toString();
  String grouped;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    final head = digits.substring(0, digits.length - 3);
    final tail = digits.substring(digits.length - 3);
    final parts = <String>[];
    for (var end = head.length; end > 0; end -= 2) {
      parts.insert(0, head.substring(end - 2 < 0 ? 0 : end - 2, end));
    }
    grouped = '${parts.join(',')},$tail';
  }
  final fraction = rest == 0 ? '' : '.${rest.toString().padLeft(2, '0')}';
  return '${negative ? '-' : ''}₹$grouped$fraction';
}

const _istOffset = Duration(hours: 5, minutes: 30);

/// The wall clock of [timeZone] at the instant [utc], as a DateTime whose fields (year ... minute) are the clock
/// reading. India has one fixed offset and no daylight saving, so it is handled exactly; any other zone falls back
/// to the device clock until a second time zone exists.
DateTime toCityTime(DateTime utc, String timeZone) {
  final instant = utc.toUtc();
  if (timeZone == 'Asia/Kolkata') return instant.add(_istOffset);
  final local = instant.toLocal();
  return DateTime.utc(local.year, local.month, local.day, local.hour, local.minute, local.second);
}

/// The reverse: a wall-clock reading in [timeZone] (the fields of [wall]) as the real instant in UTC.
DateTime cityWallToUtc(DateTime wall, String timeZone) {
  if (timeZone == 'Asia/Kolkata') {
    return DateTime.utc(wall.year, wall.month, wall.day, wall.hour, wall.minute).subtract(_istOffset);
  }
  return DateTime(wall.year, wall.month, wall.day, wall.hour, wall.minute).toUtc();
}

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _day(DateTime w) => '${_weekdays[w.weekday - 1]}, ${w.day} ${_months[w.month - 1]}';

String _time(DateTime w) {
  final hour = w.hour % 12 == 0 ? 12 : w.hour % 12;
  return '$hour:${w.minute.toString().padLeft(2, '0')} ${w.hour < 12 ? 'am' : 'pm'}';
}

/// "Fri, 9 Oct, 10:30 am"
String formatDateTime(DateTime utc, String timeZone) {
  final w = toCityTime(utc, timeZone);
  return '${_day(w)}, ${_time(w)}';
}

/// "Fri, 9 Oct · 10:30 am – 12:30 pm", or both full dates when it spans days.
String formatRange(DateTime startUtc, DateTime endUtc, String timeZone) {
  final s = toCityTime(startUtc, timeZone);
  final e = toCityTime(endUtc, timeZone);
  if (_day(s) == _day(e)) return '${_day(s)} · ${_time(s)} – ${_time(e)}';
  return '${formatDateTime(startUtc, timeZone)} – ${formatDateTime(endUtc, timeZone)}';
}

/// Time left until [end] as "9:41"; "0:00" once it has passed.
String formatCountdown(DateTime end, DateTime now) {
  final ms = end.difference(now).inMilliseconds;
  final total = ms <= 0 ? 0 : (ms / 1000).ceil();
  return '${total ~/ 60}:${(total % 60).toString().padLeft(2, '0')}';
}
