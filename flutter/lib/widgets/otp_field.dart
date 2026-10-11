import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tokens.dart';

/// One-time code entry drawn as a row of boxes, one per digit.
///
/// A single invisible [TextFormField] sits on top and does the real work, so the system keyboard,
/// SMS autofill and paste all behave exactly like a normal text field.
class OtpField extends StatefulWidget {
  const OtpField({
    super.key,
    required this.controller,
    this.label = 'Code',
    this.length = 6,
    this.errorText,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String label;
  final int length;
  final String? errorText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;

  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  final _focus = FocusNode();

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasError = widget.errorText != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        SizedBox(
          height: 56,
          child: Stack(
            children: [
              ListenableBuilder(
                listenable: Listenable.merge([widget.controller, _focus]),
                builder: (context, _) {
                  final text = widget.controller.text;
                  final active = _focus.hasFocus ? text.length.clamp(0, widget.length - 1) : -1;
                  return Row(
                    children: [
                      for (var i = 0; i < widget.length; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: Tokens.surface,
                              borderRadius: BorderRadius.circular(Tokens.radiusControl),
                              border: Border.all(
                                color: hasError
                                    ? Tokens.danger
                                    : i == active
                                        ? Tokens.ink
                                        : Tokens.line,
                                width: i == active ? 1.5 : 1,
                              ),
                            ),
                            child: Text(
                              i < text.length ? text[i] : '',
                              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                      ],
                    ],
                  );
                },
              ),
              // Invisible input covering the boxes: taps anywhere focus it.
              Positioned.fill(
                child: TextFormField(
                  controller: widget.controller,
                  focusNode: _focus,
                  autofocus: widget.autofocus,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(widget.length),
                  ],
                  onChanged: widget.onChanged,
                  onFieldSubmitted: widget.onSubmitted,
                  showCursor: false,
                  enableInteractiveSelection: false,
                  style: const TextStyle(color: Colors.transparent),
                  cursorColor: Colors.transparent,
                  decoration: const InputDecoration(
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    errorBorder: InputBorder.none,
                    focusedErrorBorder: InputBorder.none,
                    counterText: '',
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: 6),
          Text(widget.errorText!, style: const TextStyle(color: Tokens.danger, fontSize: 13)),
        ],
      ],
    );
  }
}
