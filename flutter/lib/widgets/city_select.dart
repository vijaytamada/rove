import 'package:flutter/material.dart';

import '../models/fleet.dart';
import '../theme/tokens.dart';

/// Past this many cities the picker sheet gets a search box.
const _searchFrom = 8;

/// City picker that stays compact however many cities there are: one button showing the current city, which
/// opens a list in a bottom sheet. With a single city there is nothing to pick, so it is just a label.
class CitySelect extends StatelessWidget {
  const CitySelect({super.key, required this.cities, required this.selected, required this.onSelected});

  final List<CityView> cities;
  final CityView selected;
  final ValueChanged<CityView> onSelected;

  @override
  Widget build(BuildContext context) {
    if (cities.length <= 1) {
      return Row(
        children: [
          const Icon(Icons.place_outlined, size: 18, color: Tokens.inkMuted),
          const SizedBox(width: 6),
          Flexible(
            child: Text('${selected.name}, ${selected.state}', style: const TextStyle(color: Tokens.inkMuted)),
          ),
        ],
      );
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: OutlinedButton.icon(
        onPressed: () async {
          final picked = await showModalBottomSheet<CityView>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            builder: (_) => _CitySheet(cities: cities, selected: selected),
          );
          if (picked != null && picked.id != selected.id) onSelected(picked);
        },
        icon: const Icon(Icons.place_outlined, size: 18),
        label: Row(
          mainAxisSize: MainAxisSize.min,
          children: [Text(selected.name), const SizedBox(width: 4), const Icon(Icons.expand_more, size: 18)],
        ),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
      ),
    );
  }
}

class _CitySheet extends StatefulWidget {
  const _CitySheet({required this.cities, required this.selected});

  final List<CityView> cities;
  final CityView selected;

  @override
  State<_CitySheet> createState() => _CitySheetState();
}

class _CitySheetState extends State<_CitySheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final shown = q.isEmpty
        ? widget.cities
        : widget.cities.where((c) => '${c.name} ${c.state}'.toLowerCase().contains(q)).toList();
    return Padding(
      padding: EdgeInsets.fromLTRB(Tokens.gutter, 0, Tokens.gutter, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Choose a city', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          if (widget.cities.length >= _searchFrom) ...[
            TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: const InputDecoration(hintText: 'Search cities', prefixIcon: Icon(Icons.search)),
            ),
            const SizedBox(height: 8),
          ],
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final c in shown)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w500)),
                    subtitle: Text(c.state),
                    trailing: c.id == widget.selected.id ? const Icon(Icons.check, color: Tokens.accent) : null,
                    onTap: () => Navigator.of(context).pop(c),
                  ),
                if (shown.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: Text('No city matches your search.', style: TextStyle(color: Tokens.inkMuted))),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
