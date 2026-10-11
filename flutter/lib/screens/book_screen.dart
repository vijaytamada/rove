import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/booking_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models/booking.dart';
import '../theme/tokens.dart';
import '../widgets/form_banner.dart';
import '../widgets/load_states.dart';
import '../widgets/price_breakdown.dart';
import '../widgets/status_chip.dart';
import '../widgets/sticky_cta.dart';
import 'pay_screen.dart';
import 'settle_screen.dart';
import 'verify_screen.dart';

const _durations = [1, 2, 3, 4, 6, 8, 12, 24];

/// One scooter: its rates and rules, when to start, how long, and the live price (always from the backend).
class BookScreen extends StatefulWidget {
  const BookScreen({super.key, required this.vehicleId});

  final String vehicleId;

  @override
  State<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends State<BookScreen> {
  late final BookingApi _api;
  VehicleDetail? _detail;
  ApiError? _loadError;
  bool _loading = true;
  bool _started = false;

  bool _startNow = true;

  /// The picked pickup time as a wall-clock reading in the station's city (fields only).
  DateTime? _later;
  int _hours = 2;

  QuoteView? _quote;
  String? _quoteError;
  Timer? _debounce;
  int _quoteSeq = 0;

  bool _submitting = false;
  String? _submitError;
  String? _submitNotice;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _api = BookingApi(AuthScope.of(context).api);
      _loadVehicle();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  String get _tz => _detail?.station.timezone ?? 'Asia/Kolkata';

  /// When the ride starts, or null for "now". Null also while a later time has not been picked yet.
  DateTime? get _startAt => _startNow || _later == null ? null : cityWallToUtc(_later!, _tz);

  bool get _waitingForTime => !_startNow && _later == null;

  Future<void> _loadVehicle() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    final (detail, error) = await _api.vehicle(widget.vehicleId);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _detail = detail;
      _loadError = error;
    });
    if (detail != null) _scheduleQuote();
  }

  void _scheduleQuote() {
    _debounce?.cancel();
    final detail = _detail;
    if (detail == null || !detail.vehicle.available || detail.vehicle.pricing == null || _waitingForTime) {
      setState(() {
        _quote = null;
        _quoteError = null;
      });
      return;
    }
    final seq = ++_quoteSeq;
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      final (quote, error) = await _api.quote(vehicleId: widget.vehicleId, hours: _hours, startAt: _startAt);
      if (!mounted || seq != _quoteSeq) return;
      setState(() {
        _quote = quote;
        _quoteError = error?.message;
      });
    });
  }

  Future<void> _pickTime() async {
    final nowWall = toCityTime(DateTime.now().toUtc(), _tz);
    final today = DateTime(nowWall.year, nowWall.month, nowWall.day);
    final date = await showDatePicker(
      context: context,
      initialDate: _later == null ? today : DateTime(_later!.year, _later!.month, _later!.day),
      firstDate: today,
      lastDate: today.add(const Duration(days: 7)),
      helpText: 'Pickup date',
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: _later == null
          ? TimeOfDay(hour: (nowWall.hour + 1) % 24, minute: 0)
          : TimeOfDay(hour: _later!.hour, minute: _later!.minute),
      helpText: 'Pickup time (${_detail?.station.cityName ?? 'city'} time)',
    );
    if (time == null || !mounted) return;
    setState(() {
      _startNow = false;
      _later = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
    _scheduleQuote();
  }

  Future<bool> _ensureVerified() async {
    final (kyc, error) = await _api.kycStatus();
    if (!mounted) return false;
    if (error != null) {
      setState(() => _submitError = error.message);
      return false;
    }
    if (kyc!.verified) return true;
    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const VerifyScreen()));
    return done == true;
  }

  Future<void> _continue() async {
    setState(() {
      _submitting = true;
      _submitError = null;
      _submitNotice = null;
    });
    if (!await _ensureVerified()) {
      if (mounted) setState(() => _submitting = false);
      return;
    }
    final (booking, error) = await _api.create(vehicleId: widget.vehicleId, hours: _hours, startAt: _startAt);
    if (!mounted) return;
    if (error?.code == 'OUTSTANDING_BALANCE') {
      // Money is owed for an earlier ride: pay it first, then carry on with this booking.
      if (await _payWhatIsOwed(error!)) {
        if (mounted) {
          setState(() {
            _submitting = false;
            _submitNotice = 'Paid. Tap Continue to book your scooter.';
          });
        }
        return;
      }
      if (!mounted) return;
    }
    if (error != null || booking == null) {
      setState(() {
        _submitting = false;
        _submitError = error?.message ?? 'Something went wrong. Try again.';
      });
      return;
    }
    // Replace this screen so "back" from checkout never returns here to book the same scooter twice.
    await Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => PayScreen(booking: booking)));
  }

  /// Opens the pay-what-you-owe screen for the earlier ride named in the error. True once it is paid.
  Future<bool> _payWhatIsOwed(ApiError error) async {
    final owedId = error.info?['bookingId'];
    if (owedId is! String) return false;
    final (owed, _) = await _api.get(owedId);
    if (!mounted || owed == null || owed.settlement == null) return false;
    final paid = await Navigator.of(context).push<bool>(MaterialPageRoute<bool>(builder: (_) => SettleScreen(booking: owed)));
    return paid == true;
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    final bookable = detail != null && detail.vehicle.available && detail.vehicle.pricing != null;
    return Scaffold(
      appBar: AppBar(title: Text(detail?.vehicle.model.title ?? 'Scooter')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
              ? MessageState(message: _loadError!.message, onRetry: _loadVehicle)
              : _body(detail!, bookable),
      bottomNavigationBar: bookable
          ? StickyCta(
              totalAmount: _quote?.totalAmount,
              label: 'Continue',
              loading: _submitting,
              onPressed: _quote == null ? null : _continue,
              banner: _submitError != null
                  ? FormBanner.error(_submitError!)
                  : (_submitNotice == null ? null : FormBanner.success(_submitNotice!)),
            )
          : null,
    );
  }

  Widget _body(VehicleDetail detail, bool bookable) {
    final v = detail.vehicle;
    final s = detail.station;
    final pricing = v.pricing;
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(Tokens.gutter, 4, Tokens.gutter, 24),
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Scooter ${v.code}', style: const TextStyle(color: Tokens.inkMuted, fontSize: 16)),
            ),
            v.available ? const StatusChip('Available', tone: ChipTone.success) : const StatusChip('Not available'),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.place_outlined, size: 18, color: Tokens.inkMuted),
            const SizedBox(width: 8),
            Expanded(child: Text('${s.name}, ${s.address}', style: const TextStyle(color: Tokens.inkMuted))),
          ],
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                _Spec(Icons.battery_5_bar_outlined, 'Battery', v.batteryPercent == null ? '–' : '${v.batteryPercent}%'),
                _Spec(Icons.route_outlined, 'Range', '${v.model.rangeKm} km'),
                _Spec(Icons.speed_outlined, 'Top speed', '${v.model.topSpeedKmh} km/h'),
              ],
            ),
          ),
        ),
        if (pricing != null) ...[
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Rates and rules', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 12),
                  Text.rich(TextSpan(children: [
                    TextSpan(
                        text: '${formatMoney(pricing.hourlyRateAmount)} per hour',
                        style: const TextStyle(fontWeight: FontWeight.w500, color: Tokens.ink)),
                    if (pricing.dailyRateAmount != null)
                      TextSpan(text: ', never more than ${formatMoney(pricing.dailyRateAmount!)} for a day'),
                  ]), style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
                  const SizedBox(height: 8),
                  _Rule('${pricing.includedKmPerHour} km included every hour, then ${formatMoney(pricing.extraKmRateAmount)} per extra km'),
                  _Rule(
                      'Return late and pay ${formatMoney(pricing.lateFeePerHourAmount)} for each extra hour, after ${pricing.graceMinutes} minutes of grace'),
                  _Rule('${formatMoney(pricing.depositAmount)} deposit, refunded after you return the scooter in good shape'),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 12),
        if (!bookable)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                pricing == null ? "This scooter can't be booked yet." : "This scooter isn't available right now.",
                style: const TextStyle(color: Tokens.inkMuted),
              ),
            ),
          )
        else ...[
          _when(s),
          const SizedBox(height: 12),
          _price(s),
        ],
      ],
    );
  }

  Widget _when(StationSummary station) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('When do you start?', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _Pill(
                    label: 'Start now',
                    expand: true,
                    selected: _startNow,
                    onTap: () {
                      setState(() => _startNow = true);
                      _scheduleQuote();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _Pill(
                    label: 'Pick a time',
                    expand: true,
                    selected: !_startNow,
                    onTap: () {
                      if (_later == null) {
                        _pickTime();
                      } else {
                        setState(() => _startNow = false);
                        _scheduleQuote();
                      }
                    },
                  ),
                ),
              ],
            ),
            if (!_startNow) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _pickTime,
                icon: const Icon(Icons.event_outlined, size: 18),
                label: Text(_later == null
                    ? 'Choose date and time'
                    : formatDateTime(cityWallToUtc(_later!, station.timezone), station.timezone)),
              ),
              const SizedBox(height: 6),
              Text('Up to 7 days ahead. Times are in ${station.cityName} time.',
                  style: const TextStyle(color: Tokens.inkMuted, fontSize: 13)),
            ],
            const SizedBox(height: 20),
            Text('How long?', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final h in _durations)
                  _Pill(
                    label: h == 24 ? '1 day' : '$h ${h == 1 ? 'hour' : 'hours'}',
                    selected: _hours == h,
                    onTap: () {
                      setState(() => _hours = h);
                      _scheduleQuote();
                    },
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _price(StationSummary station) {
    final q = _quote;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your price', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            if (_waitingForTime)
              const Text('Choose a pickup time to see the price.', style: TextStyle(color: Tokens.inkMuted))
            else if (_quoteError != null)
              FormBanner.error(_quoteError!)
            else if (q == null)
              const Text('Checking price…', style: TextStyle(color: Tokens.inkMuted))
            else ...[
              PriceBreakdown(
                rentalAmount: q.rentalAmount,
                depositAmount: q.depositAmount,
                totalAmount: q.totalAmount,
                hours: q.hours,
              ),
              const SizedBox(height: 16),
              _Rule(formatRange(q.startAt, q.endAt, station.timezone)),
              _Rule('Pick up at ${station.name}'),
              _Rule('Includes ${q.includedKm} km. We hold the scooter for ${q.holdMinutes} minutes while you pay.'),
            ],
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.selected, required this.onTap, this.expand = false});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  /// Fill the width it is given (for pills in a row); false for pills that wrap.
  final bool expand;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: expand ? SizedBox(width: double.infinity, child: Text(label, textAlign: TextAlign.center)) : Text(label),
      selected: selected,
      showCheckmark: false,
      selectedColor: Tokens.ink,
      labelStyle: TextStyle(color: selected ? Colors.white : Tokens.ink, fontWeight: FontWeight.w500),
      shape: const StadiumBorder(side: BorderSide(color: Tokens.line)),
      materialTapTargetSize: MaterialTapTargetSize.padded,
      onSelected: (_) => onTap(),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(color: Tokens.inkMuted, fontSize: 14)),
      );
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
