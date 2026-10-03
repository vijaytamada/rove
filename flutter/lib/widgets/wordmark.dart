import 'package:flutter/material.dart';

import '../config.dart';
import '../theme/tokens.dart';

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 22});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        text: appName.toLowerCase(),
        children: const [TextSpan(text: '.', style: TextStyle(color: Tokens.accent))],
      ),
      style: TextStyle(fontSize: size, fontWeight: FontWeight.w600, letterSpacing: -0.5, color: Tokens.ink),
    );
  }
}
