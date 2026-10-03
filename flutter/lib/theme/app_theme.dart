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

  OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(Tokens.radiusControl),
        borderSide: BorderSide(color: color, width: width),
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
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Tokens.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: const TextStyle(color: Tokens.inkFaint),
      border: border(Tokens.line),
      enabledBorder: border(Tokens.line),
      focusedBorder: border(Tokens.ink, 1.5),
      errorBorder: border(Tokens.danger),
      focusedErrorBorder: border(Tokens.danger, 1.5),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Tokens.ink,
        foregroundColor: Colors.white,
        disabledBackgroundColor: Tokens.ink.withValues(alpha: 0.6),
        disabledForegroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Tokens.ink,
        minimumSize: const Size.fromHeight(52),
        side: const BorderSide(color: Tokens.line),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: Tokens.ink),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Tokens.surface,
      indicatorColor: Tokens.accentSoft,
    ),
  );
}
