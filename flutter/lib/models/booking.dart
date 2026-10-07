import 'fleet.dart';
import 'pricing.dart';

DateTime _time(Object? value) => DateTime.parse(value as String).toUtc();
DateTime? _timeOrNull(Object? value) => value == null ? null : _time(value);

/// A pickup station with the time zone of its city.
class StationSummary {
  const StationSummary({
    required this.id,
    required this.name,
    required this.address,
    required this.cityName,
    required this.timezone,
    this.opensAt,
    this.closesAt,
  });

  final String id;
  final String name;
  final String address;
  final String cityName;
  final String timezone;
  final String? opensAt;
  final String? closesAt;

  String get hoursLabel => opensAt != null && closesAt != null ? 'Open $opensAt – $closesAt' : 'Open 24 hours';

  factory StationSummary.fromJson(Map<String, dynamic> json) => StationSummary(
        id: json['id'] as String,
        name: json['name'] as String,
        address: json['address'] as String,
        cityName: json['cityName'] as String? ?? '',
        timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
        opensAt: json['opensAt'] as String?,
        closesAt: json['closesAt'] as String?,
      );
}

/// `GET /vehicles/:id`: one scooter with its station, for the booking screen.
class VehicleDetail {
  const VehicleDetail({required this.vehicle, required this.station});

  final VehiclePublicView vehicle;
  final StationSummary station;

  factory VehicleDetail.fromJson(Map<String, dynamic> json) => VehicleDetail(
        vehicle: VehiclePublicView.fromJson(json['vehicle'] as Map<String, dynamic>),
        station: StationSummary.fromJson(json['station'] as Map<String, dynamic>),
      );
}

/// The price and window for one scooter, worked out by the backend.
class QuoteView {
  const QuoteView({
    required this.hours,
    required this.rentalAmount,
    required this.depositAmount,
    required this.totalAmount,
    required this.includedKm,
    required this.startAt,
    required this.endAt,
    required this.holdMinutes,
  });

  final int hours;
  final int rentalAmount;
  final int depositAmount;
  final int totalAmount;
  final int includedKm;
  final DateTime startAt;
  final DateTime endAt;
  final int holdMinutes;

  factory QuoteView.fromJson(Map<String, dynamic> json) => QuoteView(
        hours: (json['hours'] as num).toInt(),
        rentalAmount: (json['rentalAmount'] as num).toInt(),
        depositAmount: (json['depositAmount'] as num).toInt(),
        totalAmount: (json['totalAmount'] as num).toInt(),
        includedKm: (json['includedKm'] as num).toInt(),
        startAt: _time(json['startAt']),
        endAt: _time(json['endAt']),
        holdMinutes: (json['holdMinutes'] as num).toInt(),
      );
}

enum BookingStatus {
  pendingPayment('PENDING_PAYMENT', 'Waiting for payment'),
  confirmed('CONFIRMED', 'Confirmed'),
  inRide('IN_RIDE', 'In ride'),
  returned('RETURNED', 'Returned'),
  settled('SETTLED', 'Settled'),
  cancelled('CANCELLED', 'Cancelled'),
  expired('EXPIRED', 'Expired'),
  noShow('NO_SHOW', 'No show');

  const BookingStatus(this.wire, this.label);

  final String wire;
  final String label;

  static BookingStatus parse(String wire) => values.firstWhere((s) => s.wire == wire, orElse: () => BookingStatus.expired);
}

/// What cancelling right now would do, from the backend.
class CancellationOutcome {
  const CancellationOutcome({required this.allowed, required this.refundAmount, required this.retainedAmount});

  final bool allowed;
  final int refundAmount;
  final int retainedAmount;

  factory CancellationOutcome.fromJson(Map<String, dynamic> json) => CancellationOutcome(
        allowed: json['allowed'] as bool,
        refundAmount: (json['refundAmount'] as num).toInt(),
        retainedAmount: (json['retainedAmount'] as num).toInt(),
      );
}

class BookingView {
  const BookingView({
    required this.id,
    required this.code,
    required this.status,
    required this.startAt,
    required this.endAt,
    required this.hours,
    required this.createdAt,
    required this.rentalAmount,
    required this.depositAmount,
    required this.totalAmount,
    required this.pricing,
    required this.includedKm,
    required this.vehicleId,
    required this.vehicleCode,
    required this.model,
    required this.station,
    required this.refundedAmount,
    required this.cancellation,
    this.holdExpiresAt,
    this.confirmedAt,
    this.cancelledAt,
    this.pin,
  });

  final String id;
  final String code;
  final BookingStatus status;
  final DateTime startAt;
  final DateTime endAt;
  final int hours;
  final DateTime? holdExpiresAt;
  final DateTime? confirmedAt;
  final DateTime? cancelledAt;
  final DateTime createdAt;
  final int rentalAmount;
  final int depositAmount;
  final int totalAmount;
  final PricingView pricing;
  final int includedKm;

  /// Pickup PIN, only while the booking is confirmed or in progress.
  final String? pin;
  final String vehicleId;
  final String vehicleCode;
  final VehicleModelView model;
  final StationSummary station;
  final int refundedAmount;
  final CancellationOutcome cancellation;

  factory BookingView.fromJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] as Map<String, dynamic>;
    return BookingView(
      id: json['id'] as String,
      code: json['code'] as String,
      status: BookingStatus.parse(json['status'] as String),
      startAt: _time(json['startAt']),
      endAt: _time(json['endAt']),
      hours: (json['hours'] as num).toInt(),
      holdExpiresAt: _timeOrNull(json['holdExpiresAt']),
      confirmedAt: _timeOrNull(json['confirmedAt']),
      cancelledAt: _timeOrNull(json['cancelledAt']),
      createdAt: _time(json['createdAt']),
      rentalAmount: (json['rentalAmount'] as num).toInt(),
      depositAmount: (json['depositAmount'] as num).toInt(),
      totalAmount: (json['totalAmount'] as num).toInt(),
      pricing: PricingView.fromJson(json['pricing'] as Map<String, dynamic>),
      includedKm: (json['includedKm'] as num).toInt(),
      pin: json['pin'] as String?,
      vehicleId: vehicle['id'] as String,
      vehicleCode: vehicle['code'] as String,
      model: VehicleModelView.fromJson(vehicle['model'] as Map<String, dynamic>),
      station: StationSummary.fromJson(json['station'] as Map<String, dynamic>),
      refundedAmount: (json['refundedAmount'] as num).toInt(),
      cancellation: CancellationOutcome.fromJson(json['cancellation'] as Map<String, dynamic>),
    );
  }
}

/// Identity check state. `NOT_STARTED` means the customer has not begun it.
class KycView {
  const KycView({required this.status});

  final String status;

  bool get verified => status == 'VERIFIED';

  factory KycView.fromJson(Map<String, dynamic> json) => KycView(status: json['status'] as String);
}

enum BookingTab {
  active('active', 'Active', 'Nothing active right now.'),
  upcoming('upcoming', 'Upcoming', 'No upcoming bookings.'),
  past('past', 'Past', 'Finished and cancelled bookings show up here.');

  const BookingTab(this.wire, this.label, this.empty);

  final String wire;
  final String label;
  final String empty;
}
