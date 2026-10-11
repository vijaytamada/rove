import 'pricing.dart';

class CityView {
  const CityView({required this.id, required this.name, required this.state});

  final String id;
  final String name;
  final String state;

  factory CityView.fromJson(Map<String, dynamic> json) =>
      CityView(id: json['id'] as String, name: json['name'] as String, state: json['state'] as String);
}

class StationView {
  const StationView({
    required this.id,
    required this.cityId,
    required this.name,
    required this.address,
    required this.availableVehicles,
    this.openNow = true,
    this.opensAt,
    this.closesAt,
  });

  final String id;
  final String cityId;
  final String name;
  final String address;
  final int availableVehicles;

  /// Inside opening hours right now (city time). Booking a later time is still possible.
  final bool openNow;
  final String? opensAt;
  final String? closesAt;

  String get hoursLabel => opensAt != null && closesAt != null ? '$opensAt – $closesAt' : 'Open 24 hours';

  factory StationView.fromJson(Map<String, dynamic> json) => StationView(
        id: json['id'] as String,
        cityId: json['cityId'] as String,
        name: json['name'] as String,
        address: json['address'] as String,
        availableVehicles: (json['availableVehicles'] as num?)?.toInt() ?? 0,
        openNow: json['openNow'] as bool? ?? true,
        opensAt: json['opensAt'] as String?,
        closesAt: json['closesAt'] as String?,
      );
}

class VehicleModelView {
  const VehicleModelView({required this.brand, required this.name, required this.rangeKm, required this.topSpeedKmh});

  final String brand;
  final String name;
  final int rangeKm;
  final int topSpeedKmh;

  String get title => '$brand $name';

  factory VehicleModelView.fromJson(Map<String, dynamic> json) => VehicleModelView(
        brand: json['brand'] as String,
        name: json['name'] as String,
        rangeKm: (json['rangeKm'] as num).toInt(),
        topSpeedKmh: (json['topSpeedKmh'] as num).toInt(),
      );
}

/// What a customer sees for a scooter at a station.
class VehiclePublicView {
  const VehiclePublicView({
    required this.id,
    required this.code,
    required this.model,
    this.batteryPercent,
    this.available = true,
    this.pricing,
  });

  final String id;
  final String code;
  final int? batteryPercent;
  final VehicleModelView model;

  /// False when the scooter is out of service or already in use (the booking screen can still show it).
  final bool available;

  /// The price here. Null means no pricing plan covers it yet, so it cannot be booked.
  final PricingView? pricing;

  factory VehiclePublicView.fromJson(Map<String, dynamic> json) => VehiclePublicView(
        id: json['id'] as String,
        code: json['code'] as String,
        batteryPercent: (json['batteryPercent'] as num?)?.toInt(),
        model: VehicleModelView.fromJson(json['model'] as Map<String, dynamic>),
        available: (json['status'] as String?) == null || json['status'] == 'AVAILABLE',
        pricing: json['pricing'] == null ? null : PricingView.fromJson(json['pricing'] as Map<String, dynamic>),
      );
}
