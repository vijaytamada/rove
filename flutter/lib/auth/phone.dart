final _e164 = RegExp(r'^\+[1-9]\d{7,14}$');

/// Turns what a person types into the strict E.164 form the API expects (`+919876543210`).
/// A bare 10-digit number is treated as Indian (+91). Anything else is returned as typed (spaces
/// removed) so the validation message can tell them what is wrong.
String normalizePhone(String input) {
  final cleaned = input.replaceAll(RegExp(r'[\s\-().]'), '');
  if (cleaned.startsWith('+')) return cleaned;
  if (RegExp(r'^00\d+$').hasMatch(cleaned)) return '+${cleaned.substring(2)}';
  if (RegExp(r'^\d{10}$').hasMatch(cleaned)) return '+91$cleaned';
  if (RegExp(r'^0\d{10}$').hasMatch(cleaned)) return '+91${cleaned.substring(1)}';
  if (RegExp(r'^91\d{10}$').hasMatch(cleaned)) return '+$cleaned';
  return cleaned;
}

bool isValidPhone(String normalized) => _e164.hasMatch(normalized);

/// "+919876543210" -> "+91 98765 43210" for display. Other countries are shown unchanged.
String formatPhone(String phone) {
  final m = RegExp(r'^\+91(\d{5})(\d{5})$').firstMatch(phone);
  return m == null ? phone : '+91 ${m[1]} ${m[2]}';
}
