import 'package:flutter/material.dart';

import '../format.dart';
import '../theme/tokens.dart';
import 'primary_button.dart';

/// The bar at the bottom of checkout screens: the total on the left, the one main button on the right.
class StickyCta extends StatelessWidget {
  const StickyCta({
    super.key,
    required this.totalAmount,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.banner,
  });

  /// Null while the price is not known yet (shows a dash).
  final int? totalAmount;
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  /// Optional message above the bar (an error, for example).
  final Widget? banner;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Tokens.surface,
      child: DecoratedBox(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Tokens.line))),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Tokens.gutter, 12, Tokens.gutter, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (banner != null) ...[banner!, const SizedBox(height: 12)],
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('Total', style: TextStyle(color: Tokens.inkMuted, fontSize: 12)),
                          Text(totalAmount == null ? '–' : formatMoney(totalAmount!),
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                    SizedBox(
                      width: 180,
                      child: PrimaryButton(label: label, onPressed: onPressed, loading: loading),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
