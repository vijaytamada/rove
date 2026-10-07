import 'package:flutter/material.dart';

import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../models/booking.dart';
import '../models/user.dart';
import '../theme/tokens.dart';
import '../widgets/booking_cards.dart';
import '../widgets/wordmark.dart';
import 'booking_detail_screen.dart';

class HomeTab extends StatefulWidget {
  const HomeTab({super.key, required this.active});

  /// True while this tab is on screen. The "your booking" card refreshes each time it becomes visible.
  final bool active;

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  BookingView? _next;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _loadNext();
    }
  }

  @override
  void didUpdateWidget(HomeTab old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _loadNext();
  }

  /// The booking a customer most likely cares about: something active, else the next upcoming one.
  Future<void> _loadNext() async {
    final auth = AuthScope.of(context);
    if (auth.user?.role != Role.customer) return;
    final api = BookingApi(auth.api);
    for (final tab in [BookingTab.active, BookingTab.upcoming]) {
      final (items, _) = await api.list(tab, limit: 1);
      if (!mounted) return;
      if (items != null && items.isNotEmpty) {
        setState(() => _next = items.first);
        return;
      }
    }
    if (mounted) setState(() => _next = null);
  }

  @override
  Widget build(BuildContext context) {
    final user = AuthScope.of(context).user!;
    final theme = Theme.of(context);
    final staff = user.role != Role.customer;
    final next = _next;

    return Scaffold(
      appBar: AppBar(title: const Wordmark(), centerTitle: false),
      body: RefreshIndicator(
        onRefresh: _loadNext,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Tokens.gutter, 8, Tokens.gutter, 24),
          children: [
            Text('Hi, ${user.fullName.split(' ').first}',
                style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(
              staff
                  ? 'Station and admin tools are on the website. This app is for riders.'
                  : 'Find a station, pick a scooter and book it in a minute.',
              style: const TextStyle(color: Tokens.inkMuted, fontSize: 16),
            ),
            if (next != null) ...[
              const SizedBox(height: 24),
              Text(next.status == BookingStatus.pendingPayment ? 'Finish your booking' : 'Your booking',
                  style: const TextStyle(color: Tokens.inkMuted, fontWeight: FontWeight.w500)),
              const SizedBox(height: 8),
              BookingCard(
                booking: next,
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => BookingDetailScreen(bookingId: next.id, initial: next)),
                  );
                  if (mounted) _loadNext();
                },
              ),
            ],
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('How it works', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    const _Step(1, 'Choose a station', 'Pick your city and the station closest to you.'),
                    const _Step(2, 'Book and pay', 'Select a scooter and duration. Pay the rental plus a refundable deposit.'),
                    const _Step(3, 'Pick up', 'Show your booking code and PIN at the station.'),
                    const _Step(4, 'Return and settle', 'Drop it at any station in your city. Your deposit comes back.'),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step(this.number, this.title, this.body);

  final int number;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: Tokens.accentSoft, shape: BoxShape.circle),
            child: Text('$number', style: const TextStyle(color: Tokens.accentInk, fontWeight: FontWeight.w500)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text(body, style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
