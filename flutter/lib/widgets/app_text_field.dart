import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tokens.dart';

/// Label above the field (matches the website), with an inline error and optional hint.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.label,
    required this.controller,
    this.errorText,
    this.hint,
    this.helper,
    this.keyboardType,
    this.obscureText = false,
    this.autofillHints,
    this.textInputAction,
    this.maxLength,
    this.validator,
    this.onSubmitted,
    this.onChanged,
    this.inputFormatters,
    this.autofocus = false,
    this.prefix,
  });

  final String label;
  final TextEditingController controller;
  final String? errorText;
  final String? hint;
  final String? helper;
  final TextInputType? keyboardType;
  final bool obscureText;
  final Iterable<String>? autofillHints;
  final TextInputAction? textInputAction;
  final int? maxLength;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;
  final bool autofocus;

  /// Always-visible text before the input (e.g. a country code).
  final String? prefix;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          autofillHints: autofillHints,
          textInputAction: textInputAction,
          maxLength: maxLength,
          validator: validator,
          onFieldSubmitted: onSubmitted,
          onChanged: onChanged,
          inputFormatters: inputFormatters,
          autofocus: autofocus,
          decoration: InputDecoration(
            hintText: hint,
            helperText: helper,
            helperMaxLines: 2,
            prefixIcon: prefix == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(left: 16, right: 8),
                    child: Text(prefix!, style: const TextStyle(fontSize: 16, color: Tokens.inkMuted)),
                  ),
            prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            errorText: errorText,
            errorMaxLines: 3,
            counterText: '',
          ),
        ),
      ],
    );
  }
}
