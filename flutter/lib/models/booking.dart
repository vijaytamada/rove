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

/// The ride itself, once the scooter was handed over.
class RentalSummary {
  const RentalSummary({required this.startedAt, this.endedAt, this.distanceKm, this.returnStationName});

  final DateTime startedAt;
  final DateTime? endedAt;
  final double? distanceKm;
  final String? returnStationName;

  factory RentalSummary.fromJson(Map<String, dynamic> json) => RentalSummary(
        startedAt: _time(json['startedAt']),
        endedAt: _timeOrNull(json['endedAt']),
        distanceKm: (json['distanceKm'] as num?)?.toDouble(),
        returnStationName: json['returnStationName'] as String?,
      );
}

enum SettlementStatus {
  refundPending('REFUND_PENDING'),
  refunded('REFUNDED'),
  outstanding('OUTSTANDING'),
  cleared('CLEARED'),
  noAction('NO_ACTION');

  const SettlementStatus(this.wire);

  final String wire;

  static SettlementStatus parse(String wire) => values.firstWhere((s) => s.wire == wire, orElse: () => SettlementStatus.noAction);
}

/// One charge on the final bill: extra distance, a late return or damage.
class SettlementLine {
  const SettlementLine({required this.type, required this.description, required this.quantity, required this.unitAmount, required this.amount});

  /// `EXTRA_KM`, `LATE_FEE` or `DAMAGE`.
  final String type;
  final String description;
  final int quantity;
  final int unitAmount;
  final int amount;

  String get label => switch (type) {
        'EXTRA_KM' => 'Extra distance',
        'LATE_FEE' => 'Late return',
        _ => 'Damage',
      };

  factory SettlementLine.fromJson(Map<String, dynamic> json) => SettlementLine(
        type: json['type'] as String,
        description: json['description'] as String,
        quantity: (json['quantity'] as num).toInt(),
        unitAmount: (json['unitAmount'] as num).toInt(),
        amount: (json['amount'] as num).toInt(),
      );
}

/// The final bill of a ride: charges taken from the deposit, then a refund or an amount owed. All amounts come from the backend.
class SettlementView {
  const SettlementView({
    required this.id,
    required this.status,
    required this.depositHeld,
    required this.totalCharges,
    required this.refundAmount,
    required this.outstandingAmount,
    required this.lines,
    required this.payable,
    this.clearedAt,
  });

  final String id;
  final SettlementStatus status;
  final int depositHeld;
  final int totalCharges;
  final int refundAmount;
  final int outstandingAmount;
  final List<SettlementLine> lines;
  final bool payable;
  final DateTime? clearedAt;

  factory SettlementView.fromJson(Map<String, dynamic> json) => SettlementView(
        id: json['id'] as String,
        status: SettlementStatus.parse(json['status'] as String),
        depositHeld: (json['depositHeld'] as num).toInt(),
        totalCharges: (json['totalCharges'] as num).toInt(),
        refundAmount: (json['refundAmount'] as num).toInt(),
        outstandingAmount: (json['outstandingAmount'] as num).toInt(),
        lines: (json['lineItems'] as List).map((e) => SettlementLine.fromJson(e as Map<String, dynamic>)).toList(),
        payable: json['payable'] as bool,
        clearedAt: _timeOrNull(json['clearedAt']),
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
    this.rental,
    this.settlement,
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
  final RentalSummary? rental;

  /// The final bill, once the scooter has been returned.
  final SettlementView? settlement;

  /// Settled, but money is still owed for the ride.
  bool get owing => settlement?.status == SettlementStatus.outstanding;

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
      rental: json['rental'] == null ? null : RentalSummary.fromJson(json['rental'] as Map<String, dynamic>),
      settlement: json['settlement'] == null ? null : SettlementView.fromJson(json['settlement'] as Map<String, dynamic>),
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

/// What a customer owes for an earlier ride, and which booking it belongs to.
class OwedAmount {
  const OwedAmount({required this.bookingId, required this.amount});

  final String bookingId;
  final int amount;

  factory OwedAmount.fromJson(Map<String, dynamic> json) =>
      OwedAmount(bookingId: json['bookingId'] as String, amount: (json['amount'] as num).toInt());
}

/// A customer's home: what needs attention, what is next, recent rides, what they owe. Worked out by the backend.
class CustomerDashboard {
  const CustomerDashboard({
    this.active,
    this.upcoming,
    this.recent = const [],
    this.owed,
    this.rides = 0,
    this.distanceKm = 0,
  });

  final BookingView? active;
  final BookingView? upcoming;
  final List<BookingView> recent;
  final OwedAmount? owed;
  final int rides;
  final double distanceKm;

  /// The booking to show first: something active, else the next one.
  BookingView? get next => active ?? upcoming;

  factory CustomerDashboard.fromJson(Map<String, dynamic> json) {
    BookingView? one(Object? v) => v == null ? null : BookingView.fromJson(v as Map<String, dynamic>);
    final stats = json['stats'] as Map<String, dynamic>;
    return CustomerDashboard(
      active: one(json['active']),
      upcoming: one(json['upcoming']),
      recent: (json['recent'] as List).map((e) => BookingView.fromJson(e as Map<String, dynamic>)).toList(),
      owed: json['owed'] == null ? null : OwedAmount.fromJson(json['owed'] as Map<String, dynamic>),
      rides: (stats['rides'] as num).toInt(),
      distanceKm: (stats['distanceKm'] as num).toDouble(),
    );
  }
}
