import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Tokens.accent,
    brightness: Brightness.light,
  ).copyWith(
    primary: Tokens.ink,
    onPrimary: Colors.white,
    secondary: Tokens.accent,
    surface: Tokens.surface,
    onSurface: Tokens.ink,
    error: Tokens.danger,
    outline: Tokens.line,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Tokens.bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: Tokens.bg,
      foregroundColor: Tokens.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      color: Tokens.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Tokens.radiusCard),
        side: const BorderSide(color: Tokens.line),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Tokens.ink,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: const StadiumBorder(),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Tokens.surface,
      indicatorColor: Tokens.accentSoft,
    ),
  );
}
