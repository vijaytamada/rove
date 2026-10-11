import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';
import '../widgets/booking_cards.dart';
import '../widgets/load_states.dart';
import '../widgets/primary_button.dart';
import 'booking_detail_screen.dart';

/// My bookings: Active, Upcoming and Past.
class BookingsTab extends StatefulWidget {
  const BookingsTab({super.key, required this.active, required this.onFindScooter});

  /// True while this tab is the one on screen. It reloads each time it becomes visible.
  final bool active;

  /// Switches to the Stations tab (the empty state offers it).
  final VoidCallback onFindScooter;

  @override
  State<BookingsTab> createState() => _BookingsTabState();
}

class _BookingsTabState extends State<BookingsTab> {
  late final BookingApi _api;
  BookingTab _tab = BookingTab.active;
  List<BookingView>? _items;
  ApiError? _error;
  bool _loading = true;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _api = BookingApi(AuthScope.of(context).api);
      _load();
    }
  }

  @override
  void didUpdateWidget(BookingsTab old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _load(showSpinner: _items == null);
  }

  Future<void> _load({bool showSpinner = true}) async {
    final tab = _tab;
    if (showSpinner) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final (items, error) = await _api.list(tab);
    if (!mounted || tab != _tab) return;
    setState(() {
      _loading = false;
      _items = items;
      _error = error;
    });
  }

  void _select(BookingTab tab) {
    if (tab == _tab) return;
    setState(() {
      _tab = tab;
      _items = null;
    });
    _load();
  }

  Future<void> _open(BookingView b) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => BookingDetailScreen(bookingId: b.id, initial: b)),
    );
    if (mounted) _load(showSpinner: false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My bookings'), centerTitle: false),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: Tokens.gutter, vertical: 4),
              itemCount: BookingTab.values.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final t = BookingTab.values[i];
                final selected = t == _tab;
                return ChoiceChip(
                  label: Text(t.label),
                  selected: selected,
                  showCheckmark: false,
                  selectedColor: Tokens.ink,
                  labelStyle: TextStyle(color: selected ? Colors.white : Tokens.ink, fontWeight: FontWeight.w500),
                  shape: const StadiumBorder(side: BorderSide(color: Tokens.line)),
                  onSelected: (_) => _select(t),
                );
              },
            ),
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return MessageState(message: _error!.message, onRetry: _load);
    final items = _items ?? const <BookingView>[];
    if (items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_tab.empty, textAlign: TextAlign.center, style: const TextStyle(color: Tokens.inkMuted, fontSize: 16)),
              if (_tab != BookingTab.past) ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: 200,
                  child: SecondaryButton(
                    label: 'Find a scooter',
                    onPressed: widget.onFindScooter,
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(showSpinner: false),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 8, Tokens.gutter, 24),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) => BookingCard(booking: items[i], onTap: () => _open(items[i])),
      ),
    );
  }
}
