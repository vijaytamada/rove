import 'package:flutter/material.dart';

import '../theme/tokens.dart';

enum ChipTone { success, warning, danger, muted }

/// Always shows text, so status is never conveyed by colour alone.
class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, this.tone = ChipTone.muted});

  final String label;
  final ChipTone tone;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (tone) {
      ChipTone.success => (Tokens.accentSoft, Tokens.accentInk),
      ChipTone.warning => (const Color(0xFFFFFBEB), const Color(0xFF92400E)),
      ChipTone.danger => (const Color(0xFFFEF2F2), const Color(0xFFB91C1C)),
      ChipTone.muted => (Tokens.line, Tokens.inkMuted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w500)),
    );
  }
}
