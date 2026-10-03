import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import 'primary_button.dart';

/// Centered message with an optional retry button (used for empty and error states).
class MessageState extends StatelessWidget {
  const MessageState({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Tokens.inkMuted, fontSize: 16)),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              SizedBox(width: 160, child: SecondaryButton(label: 'Try again', onPressed: onRetry)),
            ],
          ],
        ),
      ),
    );
  }
}
