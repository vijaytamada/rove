import 'package:flutter/material.dart';

import '../models/fleet.dart';
import '../theme/tokens.dart';
import 'status_chip.dart';

class StationCard extends StatelessWidget {
  const StationCard({super.key, required this.station, required this.onTap});

  final StationView station;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final n = station.availableVehicles;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(station.name,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                  ),
                  n > 0 ? StatusChip('$n available', tone: ChipTone.success) : const StatusChip('None available'),
                ],
              ),
              const SizedBox(height: 10),
              _InfoRow(Icons.place_outlined, station.address),
              const SizedBox(height: 6),
              _InfoRow(Icons.schedule, station.hoursLabel),
            ],
          ),
        ),
      ),
    );
  }
}

class ScooterCard extends StatelessWidget {
  const ScooterCard({super.key, required this.vehicle});

  final VehiclePublicView vehicle;

  @override
  Widget build(BuildContext context) {
    final model = vehicle.model;
    final battery = vehicle.batteryPercent;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(model.title,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                      Text('Scooter ${vehicle.code}', style: const TextStyle(color: Tokens.inkMuted)),
                    ],
                  ),
                ),
                const StatusChip('Available', tone: ChipTone.success),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _Spec(Icons.battery_5_bar_outlined, 'Battery', battery == null ? '–' : '$battery%'),
                _Spec(Icons.route_outlined, 'Range', '${model.rangeKm} km'),
                _Spec(Icons.speed_outlined, 'Top speed', '${model.topSpeedKmh} km/h'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: Tokens.inkMuted),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(color: Tokens.inkMuted))),
      ],
    );
  }
}

class _Spec extends StatelessWidget {
  const _Spec(this.icon, this.label, this.value);

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 16, color: Tokens.inkMuted),
            const SizedBox(width: 4),
            Flexible(child: Text(label, style: const TextStyle(color: Tokens.inkMuted, fontSize: 13))),
          ]),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
