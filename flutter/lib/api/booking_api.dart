import 'dart:math';

import '../models/booking.dart';
import 'api_client.dart';

const _badResponse = ApiError(status: 200, code: 'BAD_RESPONSE', message: 'Something went wrong. Try again.');

/// Booking, payment and identity-check calls. Each returns data or an [ApiError], never both.
class BookingApi {
  const BookingApi(this.api);

  final ApiClient api;

  /// One scooter with its station and price (public).
  Future<(VehicleDetail?, ApiError?)> vehicle(String id) =>
      _one(api.get('/vehicles/$id', auth: false), VehicleDetail.fromJson);

  /// Price and availability for a window. [startAt] null means start now.
  Future<(QuoteView?, ApiError?)> quote({required String vehicleId, required int hours, DateTime? startAt}) =>
      _one(api.post('/bookings/quote', body: _window(vehicleId, hours, startAt), auth: false), QuoteView.fromJson);

  Future<(KycView?, ApiError?)> kycStatus() => _one(api.get('/kyc/status'), KycView.fromJson);

  Future<(KycView?, ApiError?)> kycStart() => _one(api.post('/kyc/start', body: {'consent': true}), KycView.fromJson);

  /// Holds the scooter for ten minutes while the customer pays.
  Future<(BookingView?, ApiError?)> create({required String vehicleId, required int hours, DateTime? startAt}) =>
      _one(api.post('/bookings', body: _window(vehicleId, hours, startAt)), BookingView.fromJson);

  /// Demo checkout. Every attempt carries its own Idempotency-Key, so a repeated request never charges twice.
  Future<(BookingView?, ApiError?)> pay(String id, {bool simulateFailure = false}) => _one(
        api.post(
          '/bookings/$id/pay',
          body: simulateFailure ? {'simulate': 'FAIL'} : const {},
          headers: {'Idempotency-Key': _newKey()},
        ),
        BookingView.fromJson,
      );

  /// Demo payment of what the customer owes after a ride. Every attempt carries its own Idempotency-Key.
  Future<(SettlementView?, ApiError?)> paySettlement(String bookingId, {bool simulateFailure = false}) => _one(
        api.post(
          '/bookings/$bookingId/settlement/pay',
          body: simulateFailure ? {'simulate': 'FAIL'} : const {},
          headers: {'Idempotency-Key': _newKey()},
        ),
        SettlementView.fromJson,
      );

  Future<(BookingView?, ApiError?)> get(String id) => _one(api.get('/bookings/$id'), BookingView.fromJson);

  Future<(BookingView?, ApiError?)> cancel(String id) => _one(api.post('/bookings/$id/cancel'), BookingView.fromJson);

  Future<(List<BookingView>?, ApiError?)> list(BookingTab tab, {int limit = 50}) async {
    final result = await api.get('/bookings?tab=${tab.wire}&limit=$limit');
    if (result is ApiError) return (null, result);
    try {
      final items = ((result as ApiOk).json['items'] as List).map((e) => BookingView.fromJson(e as Map<String, dynamic>));
      return (items.toList(), null);
    } catch (_) {
      return (null, _badResponse);
    }
  }

  Map<String, Object?> _window(String vehicleId, int hours, DateTime? startAt) => {
        'vehicleId': vehicleId,
        'hours': hours,
        'startAt': ?startAt?.toUtc().toIso8601String(),
      };

  Future<(T?, ApiError?)> _one<T>(Future<ApiResult> call, T Function(Map<String, dynamic>) parse) async {
    final result = await call;
    if (result is ApiError) return (null, result);
    try {
      return (parse((result as ApiOk).json), null);
    } catch (_) {
      return (null, _badResponse);
    }
  }

  static String _newKey() {
    final random = Random.secure();
    return List.generate(24, (_) => random.nextInt(16).toRadixString(16)).join();
  }
}
