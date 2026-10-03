import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/fleet_api.dart';
import '../auth/auth_controller.dart';
import '../models/fleet.dart';
import '../theme/tokens.dart';
import '../widgets/fleet_cards.dart';
import '../widgets/load_states.dart';
import 'station_detail_screen.dart';

/// Pick a city, then a station, to see available scooters.
class StationsTab extends StatefulWidget {
  const StationsTab({super.key});

  @override
  State<StationsTab> createState() => _StationsTabState();
}

class _StationsTabState extends State<StationsTab> {
  late final FleetApi _fleet;
  List<CityView>? _cities;
  CityView? _city;
  List<StationView>? _stations;
  ApiError? _error;
  bool _loading = true;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _fleet = FleetApi(AuthScope.of(context).api);
      _loadCities();
    }
  }

  Future<void> _loadCities() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final (cities, error) = await _fleet.cities();
    if (!mounted) return;
    if (error != null || cities == null) {
      setState(() {
        _loading = false;
        _error = error;
      });
      return;
    }
    _cities = cities;
    if (cities.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    await _selectCity(_city != null ? cities.firstWhere((c) => c.id == _city!.id, orElse: () => cities.first) : cities.first);
  }

  Future<void> _selectCity(CityView city) async {
    setState(() {
      _city = city;
      _loading = true;
      _error = null;
    });
    final (stations, error) = await _fleet.stations(city.id);
    if (!mounted || _city?.id != city.id) return;
    setState(() {
      _loading = false;
      _stations = stations;
      _error = error;
    });
  }

  Future<void> _refresh() => _cities == null ? _loadCities() : _selectCity(_city ?? _cities!.first);

  @override
  Widget build(BuildContext context) {
    final cities = _cities ?? const <CityView>[];
    return Scaffold(
      appBar: AppBar(title: const Text('Stations'), centerTitle: false),
      body: Column(
        children: [
          if (cities.length > 1)
            SizedBox(
              height: 48,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: Tokens.gutter),
                itemCount: cities.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final c = cities[i];
                  return ChoiceChip(
                    label: Text(c.name),
                    selected: c.id == _city?.id,
                    showCheckmark: false,
                    selectedColor: Tokens.ink,
                    labelStyle: TextStyle(color: c.id == _city?.id ? Colors.white : Tokens.ink),
                    shape: const StadiumBorder(side: BorderSide(color: Tokens.line)),
                    onSelected: (_) => _selectCity(c),
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
    if (_error != null) return MessageState(message: _error!.message, onRetry: _refresh);
    if (_cities != null && _cities!.isEmpty) return const MessageState(message: 'No cities are open yet. Check back soon.');
    final stations = _stations ?? const <StationView>[];
    if (stations.isEmpty) return MessageState(message: 'There are no open stations in ${_city?.name} yet.');

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(Tokens.gutter, 12, Tokens.gutter, 24),
        itemCount: stations.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) => StationCard(
          station: stations[i],
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => StationDetailScreen(station: stations[i])),
          ),
        ),
      ),
    );
  }
}
