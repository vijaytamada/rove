import 'package:flutter/material.dart';

import '../api/health.dart';
import '../config.dart';
import '../theme/tokens.dart';

/// Phase 1 hello-world: shows the app shell and backend status.
/// Feature work starts after the web MVP flow (Phase 6).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.healthFetcher = fetchHealth});

  final HealthFetcher healthFetcher;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<HealthReport?> _health = widget.healthFetcher();

  void _refresh() => setState(() => _health = widget.healthFetcher());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text.rich(
          TextSpan(
            text: appName.toLowerCase(),
            children: const [TextSpan(text: '.', style: TextStyle(color: Tokens.accent))],
          ),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 16, Tokens.gutter, 24),
        children: [
          Text('Phase 1 foundation', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Text(
            'The mobile app is running. Scooter browsing arrives in a later phase.',
            style: TextStyle(color: Tokens.inkMuted),
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: FutureBuilder<HealthReport?>(
                future: _health,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final h = snapshot.data;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Backend status', style: TextStyle(fontWeight: FontWeight.w500)),
                          _chip(h == null ? 'Unreachable' : (h.status == 'ok' ? 'All systems up' : 'Degraded'),
                              h?.status == 'ok' ? Tokens.accentInk : Tokens.danger),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _row('API', h == null ? 'down' : 'up'),
                      _row('Database', h?.database),
                      _row('Redis', h?.redis),
                      const SizedBox(height: 8),
                      TextButton(onPressed: _refresh, child: const Text('Refresh')),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'Bookings'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
        ],
        onDestinationSelected: (_) {},
      ),
    );
  }

  Widget _row(String label, String? status) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Tokens.inkMuted)),
            _chip(status == 'up' ? 'Up' : (status == 'down' ? 'Down' : 'Unknown'),
                status == 'up' ? Tokens.accentInk : (status == 'down' ? Tokens.danger : Tokens.inkMuted)),
          ],
        ),
      );

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500)),
      );
}
