import 'package:flutter/material.dart';

/// Design tokens — mirror of frontend/src/styles/tokens.css. See docs/UI.md §3.
/// Change tokens in docs/UI.md first, then in both places.
abstract final class Tokens {
  static const ink = Color(0xFF0B0B0F);
  static const inkMuted = Color(0xFF6B7280);
  static const inkFaint = Color(0xFF9CA3AF);
  static const bg = Color(0xFFFAFAFA);
  static const surface = Color(0xFFFFFFFF);
  static const line = Color(0xFFEEEEF0);
  static const accent = Color(0xFF10B981);
  static const accentSoft = Color(0xFFECFDF5);
  static const accentInk = Color(0xFF047857);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const info = Color(0xFF3B82F6);

  static const radiusCard = 16.0;
  static const radiusControl = 12.0;
  static const gutter = 20.0;
}
