import '../models/fleet.dart';
import 'api_client.dart';

/// Public browsing endpoints (no sign-in needed). Each call returns data or an [ApiError].
class FleetApi {
  const FleetApi(this.api);

  final ApiClient api;

  Future<(List<CityView>?, ApiError?)> cities() => _list('/cities', CityView.fromJson);

  Future<(List<StationView>?, ApiError?)> stations(String cityId) =>
      _list('/cities/$cityId/stations', StationView.fromJson);

  Future<(List<VehiclePublicView>?, ApiError?)> vehicles(String stationId) =>
      _list('/stations/$stationId/vehicles', VehiclePublicView.fromJson);

  Future<(List<T>?, ApiError?)> _list<T>(String path, T Function(Map<String, dynamic>) parse) async {
    final result = await api.get(path, auth: false);
    if (result is ApiError) return (null, result);
    try {
      final data = (result as ApiOk).data as List;
      return (data.map((e) => parse(e as Map<String, dynamic>)).toList(), null);
    } catch (_) {
      // The server answered, but not with the expected shape.
      return (
        null,
        const ApiError(status: 200, code: 'BAD_RESPONSE', message: 'Something went wrong. Try again.'),
      );
    }
  }
}
