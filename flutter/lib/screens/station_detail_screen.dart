import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/fleet_api.dart';
import '../auth/auth_controller.dart';
import '../models/fleet.dart';
import '../theme/tokens.dart';
import '../widgets/fleet_cards.dart';
import '../widgets/form_banner.dart';
import '../widgets/load_states.dart';
import 'book_screen.dart';

class StationDetailScreen extends StatefulWidget {
  const StationDetailScreen({super.key, required this.station});

  final StationView station;

  @override
  State<StationDetailScreen> createState() => _StationDetailScreenState();
}

class _StationDetailScreenState extends State<StationDetailScreen> {
  List<VehiclePublicView>? _vehicles;
  ApiError? _error;
  bool _loading = true;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final (vehicles, error) = await FleetApi(AuthScope.of(context).api).vehicles(widget.station.id);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _vehicles = vehicles;
      _error = error;
    });
  }

  Future<void> _book(VehiclePublicView vehicle) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BookScreen(vehicleId: vehicle.id)));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.station;
    return Scaffold(
      appBar: AppBar(title: Text(s.name)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? MessageState(message: _error!.message, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(Tokens.gutter, 4, Tokens.gutter, 24),
                    children: [
                      _Info(Icons.place_outlined, s.address),
                      const SizedBox(height: 6),
                      _Info(Icons.schedule, s.hoursLabel),
                      if (!s.openNow) ...[
                        const SizedBox(height: 16),
                        const FormBanner.notice(
                            "This station is closed right now. You can still book a scooter for a time when it's open."),
                      ],
                      const SizedBox(height: 24),
                      Text('Available now (${_vehicles!.length})',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 12),
                      if (_vehicles!.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Text('No scooters are free here right now. Try another station.',
                              style: TextStyle(color: Tokens.inkMuted, fontSize: 16)),
                        )
                      else
                        for (final v in _vehicles!) ...[
                          ScooterCard(vehicle: v, onSelect: () => _book(v)),
                          const SizedBox(height: 12),
                        ],
                    ],
                  ),
                ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Tokens.inkMuted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(color: Tokens.inkMuted, fontSize: 15))),
        ],
      );
}
