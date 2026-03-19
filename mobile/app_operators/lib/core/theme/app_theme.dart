// lib/core/theme/app_theme.dart
import 'package:flutter/material.dart';

class AppTheme {
  // ── Colori brand ────────────────────────────────────────
  static const Color primary     = Color(0xFF1A5276);  // blu istituzionale
  static const Color secondary   = Color(0xFF148F77);  // verde salute
  static const Color accent      = Color(0xFFE74C3C);  // rosso alert
  static const Color warning     = Color(0xFFF39C12);  // amber
  static const Color surface     = Color(0xFFF8F9FA);
  static const Color onPrimary   = Colors.white;

  static ThemeData get light => ThemeData(
    useMaterial3:      true,
    fontFamily:        'Nunito',
    colorScheme: ColorScheme.fromSeed(
      seedColor:   primary,
      secondary:   secondary,
      brightness:  Brightness.light,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: primary,
      foregroundColor: onPrimary,
      elevation:       0,
      centerTitle:     false,
      titleTextStyle:  TextStyle(
        fontFamily: 'Nunito', fontSize: 18,
        fontWeight: FontWeight.w700, color: onPrimary,
      ),
    ),
    cardTheme: CardTheme(
      elevation:    2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      color:        Colors.white,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: onPrimary,
        shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        padding:         const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        textStyle:       const TextStyle(fontFamily: 'Nunito', fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border:        OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      filled:        true,
      fillColor:     Colors.grey[50],
      contentPadding:const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      selectedItemColor:   primary,
      unselectedItemColor: Colors.grey,
      showUnselectedLabels:true,
      type:                BottomNavigationBarType.fixed,
      elevation:           8,
    ),
  );

  static ThemeData get dark => ThemeData(
    useMaterial3: true,
    fontFamily:   'Nunito',
    colorScheme:  ColorScheme.fromSeed(
      seedColor:  primary,
      brightness: Brightness.dark,
    ),
  );
}
