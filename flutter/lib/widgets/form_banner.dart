import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// Form-level message: error (red) or success (green).
class FormBanner extends StatelessWidget {
  const FormBanner.error(this.message, {super.key}) : success = false;
  const FormBanner.success(this.message, {super.key}) : success = true;

  final String message;
  final bool success;

  @override
  Widget build(BuildContext context) {
    final bg = success ? Tokens.accentSoft : const Color(0xFFFEF2F2);
    final fg = success ? Tokens.accentInk : const Color(0xFFB91C1C);
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Tokens.radiusControl)),
        child: Text(message, style: TextStyle(color: fg, fontSize: 14)),
      ),
    );
  }
}
