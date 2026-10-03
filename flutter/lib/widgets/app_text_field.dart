import 'package:flutter/material.dart';

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
          decoration: InputDecoration(
            hintText: hint,
            helperText: helper,
            helperMaxLines: 2,
            errorText: errorText,
            errorMaxLines: 3,
            counterText: '',
          ),
        ),
      ],
    );
  }
}
