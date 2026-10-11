import 'package:flutter/material.dart';

import '../api/notification_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models/notification.dart';
import '../theme/tokens.dart';
import '../widgets/load_states.dart';
import 'booking_detail_screen.dart';

/// Marks an unread message (tests look for it).
const unreadDotKey = ValueKey('unread-dot');

/// The customer's inbox: booking, payment, refund and reminder messages, newest first.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification>? _items;
  String? _error;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load();
    }
  }

  NotificationApi get _api => NotificationApi(AuthScope.of(context).api);

  Future<void> _load() async {
    final (items, err) = await _api.list();
    if (!mounted) return;
    setState(() {
      if (items != null) {
        _items = items;
        _error = null;
      } else if (_items == null) {
        _error = err?.message ?? 'Something went wrong. Try again.';
      }
    });
  }

  /// Marks the message read (on screen at once, on the server in the background) and opens its booking.
  Future<void> _open(AppNotification n) async {
    final api = _api;
    if (n.unread) {
      setState(() => _items = [for (final x in _items!) x.id == n.id ? x.asRead(DateTime.now().toUtc()) : x]);
      api.markRead(n.id);
    }
    final bookingId = n.bookingId;
    if (bookingId == null) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BookingDetailScreen(bookingId: bookingId)));
  }

  Future<void> _markAll() async {
    final api = _api;
    setState(() => _items = [for (final x in _items!) x.asRead(DateTime.now().toUtc())]);
    await api.markAllRead();
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final hasUnread = items != null && items.any((n) => n.unread);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (hasUnread) TextButton(onPressed: _markAll, child: const Text('Mark all as read')),
        ],
      ),
      body: items == null
          ? (_error != null
              ? MessageState(message: _error!, onRetry: _load)
              : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: _load,
              child: items.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 120),
                        MessageState(message: 'Nothing yet. Updates about your bookings and rides show up here.'),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(Tokens.gutter, 8, Tokens.gutter, 24),
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (_, i) => _NotificationCard(notification: items[i], onTap: () => _open(items[i])),
                    ),
            ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final n = notification;
    return Material(
      color: n.unread ? Tokens.accentSoft : Tokens.surface,
      borderRadius: BorderRadius.circular(Tokens.radiusCard),
      child: InkWell(
        borderRadius: BorderRadius.circular(Tokens.radiusCard),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(Tokens.radiusCard),
            border: Border.all(color: n.unread ? Tokens.accent.withValues(alpha: 0.3) : Tokens.line),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (n.unread)
                    Padding(
                      padding: const EdgeInsets.only(top: 6, right: 8),
                      child: Semantics(
                        label: 'Unread',
                        child: const SizedBox(
                          key: unreadDotKey,
                          width: 8,
                          height: 8,
                          child: DecoratedBox(decoration: BoxDecoration(color: Tokens.accent, shape: BoxShape.circle)),
                        ),
                      ),
                    ),
                  Expanded(child: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))),
                  const SizedBox(width: 8),
                  Text(formatAgo(n.createdAt, DateTime.now()), style: const TextStyle(color: Tokens.inkMuted, fontSize: 12)),
                ],
              ),
              const SizedBox(height: 6),
              Text(n.body, style: const TextStyle(color: Tokens.inkMuted, fontSize: 14, height: 1.4)),
              if (n.bookingId != null) ...[
                const SizedBox(height: 10),
                const Text('View booking', style: TextStyle(fontWeight: FontWeight.w500, fontSize: 14, decoration: TextDecoration.underline)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
