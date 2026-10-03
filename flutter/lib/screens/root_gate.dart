import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../widgets/load_states.dart';
import '../widgets/wordmark.dart';
import 'home_tab.dart';
import 'login_screen.dart';
import 'profile_tab.dart';
import 'stations_tab.dart';

/// Chooses what to show from the sign-in state: splash, sign-in, or the signed-in app.
class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    return switch (AuthScope.of(context).status) {
      AuthStatus.loading => const _Splash(),
      AuthStatus.signedOut => const LoginScreen(),
      AuthStatus.signedIn => const MainShell(),
      AuthStatus.unreachable => const _Unreachable(),
    };
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Wordmark(size: 40)));
  }
}

class _Unreachable extends StatelessWidget {
  const _Unreachable();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Wordmark(size: 32),
          const SizedBox(height: 24),
          Expanded(
            flex: 0,
            child: MessageState(
              message: "Can't reach Rove right now. Check your connection and try again.",
              onRetry: AuthScope.of(context).retry,
            ),
          ),
        ],
      ),
    );
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: const [HomeTab(), StationsTab(), ProfileTab()]),
      // Bookings joins in Phase 4.
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.place_outlined), selectedIcon: Icon(Icons.place), label: 'Stations'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
