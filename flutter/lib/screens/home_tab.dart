import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../models/user.dart';
import '../theme/tokens.dart';
import '../widgets/wordmark.dart';

class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final user = AuthScope.of(context).user!;
    final theme = Theme.of(context);
    final staff = user.role != Role.customer;

    return Scaffold(
      appBar: AppBar(title: const Wordmark(), centerTitle: false),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 8, Tokens.gutter, 24),
        children: [
          Text('Hi, ${user.fullName.split(' ').first}',
              style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text(
            staff
                ? 'Station and admin tools are on the website. This app is for riders.'
                : 'Browse stations to see which scooters are available. Booking arrives in a later phase.',
            style: const TextStyle(color: Tokens.inkMuted, fontSize: 16),
          ),
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
