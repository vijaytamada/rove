import 'package:flutter/material.dart';

import '../api/booking_api.dart';
import '../api/notification_api.dart';
import '../auth/auth_controller.dart';
import '../models/booking.dart';
import '../format.dart';
import '../models/user.dart';
import '../theme/tokens.dart';
import '../widgets/booking_cards.dart';
import '../widgets/wordmark.dart';
import 'booking_detail_screen.dart';
import 'notifications_screen.dart';
import 'settle_screen.dart';

class HomeTab extends StatefulWidget {
  const HomeTab({super.key, required this.active});

  /// True while this tab is on screen. The "your booking" card refreshes each time it becomes visible.
  final bool active;

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  CustomerDashboard? _dash;
  int _unread = 0;
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

  /// The customer's home numbers: the booking they care about, recent rides, what they owe.
  Future<void> _loadNext() async {
    final auth = AuthScope.of(context);
    if (auth.user?.role != Role.customer) return;
    final (dash, _) = await BookingApi(auth.api).dashboard();
    final unread = await NotificationApi(auth.api).unreadCount();
    if (!mounted) return;
    // Keep what is on screen if the call failed (offline): an empty home would look like the bookings are gone.
    if (dash != null || unread != null) {
      setState(() {
        if (dash != null) _dash = dash;
        if (unread != null) _unread = unread;
      });
    }
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()));
    if (mounted) _loadNext();
  }

  /// Opens the pay-what-you-owe screen for the ride the banner is about.
  Future<void> _payOwed(OwedAmount owed) async {
    final api = BookingApi(AuthScope.of(context).api);
    final (booking, _) = await api.get(owed.bookingId);
    if (!mounted || booking == null || booking.settlement == null) return;
    await Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => SettleScreen(booking: booking)));
    if (mounted) _loadNext();
  }

  @override
  Widget build(BuildContext context) {
    final user = AuthScope.of(context).user!;
    final theme = Theme.of(context);
    final staff = user.role != Role.customer;
    final dash = _dash;
    final next = dash?.next;

    return Scaffold(
      appBar: AppBar(
        title: const Wordmark(),
        centerTitle: false,
        actions: [
          if (!staff)
            IconButton(
              tooltip: _unread > 0 ? 'Notifications, $_unread unread' : 'Notifications',
              onPressed: _openNotifications,
              icon: Badge(
                isLabelVisible: _unread > 0,
                label: Text(_unread > 9 ? '9+' : '$_unread'),
                backgroundColor: Tokens.accent,
                child: const Icon(Icons.notifications_none),
              ),
            ),
          const SizedBox(width: 4),
        ],
      ),
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
            if (dash?.owed != null) ...[
              const SizedBox(height: 24),
              _OwedBanner(owed: dash!.owed!, onTap: () => _payOwed(dash.owed!)),
            ],
            if (next != null) ...[
              const SizedBox(height: 24),
              Text(
                  next.status == BookingStatus.pendingPayment
                      ? 'Finish your booking'
                      : (dash!.active != null ? 'Your booking' : 'Coming up'),
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
            if (dash != null && dash.recent.isNotEmpty) ...[
              const SizedBox(height: 24),
              Row(
                children: [
                  const Expanded(
                    child: Text('Recent rides', style: TextStyle(color: Tokens.inkMuted, fontWeight: FontWeight.w500)),
                  ),
                  if (dash.rides > 0)
                    Text('${dash.rides} ${dash.rides == 1 ? 'ride' : 'rides'} · ${formatKm(dash.distanceKm)} km',
                        style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
                ],
              ),
              const SizedBox(height: 8),
              Card(
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    for (final (i, b) in dash.recent.indexed) ...[
                      if (i > 0) const Divider(height: 1, color: Tokens.line),
                      ListTile(
                        title: Text(b.model.title, style: const TextStyle(fontWeight: FontWeight.w500)),
                        subtitle: Text('${b.station.name} · ${formatDateTime(b.startAt, b.station.timezone)}'),
                        trailing: BookingStatusChip(b.status),
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute<void>(builder: (_) => BookingDetailScreen(bookingId: b.id, initial: b)),
                          );
                          if (mounted) _loadNext();
                        },
                      ),
                    ],
                  ],
                ),
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

/// Money owed for an earlier ride: tapping it opens the payment screen.
class _OwedBanner extends StatelessWidget {
  const _OwedBanner({required this.owed, required this.onTap});

  final OwedAmount owed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(Tokens.radiusControl),
        child: InkWell(
          borderRadius: BorderRadius.circular(Tokens.radiusControl),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text.rich(
              TextSpan(
                style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 14),
                children: [
                  TextSpan(
                      text: 'You owe ${formatMoney(owed.amount)} for your last ride. ',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const TextSpan(text: 'Pay it to book again.'),
                ],
              ),
            ),
          ),
        ),
      );
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
