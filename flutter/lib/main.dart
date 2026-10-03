import 'package:flutter/material.dart';

import 'config.dart';
import 'screens/home_screen.dart';
import 'theme/app_theme.dart';

void main() => runApp(const RoveApp());

class RoveApp extends StatelessWidget {
  const RoveApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: appName,
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const HomeScreen(),
    );
  }
}
