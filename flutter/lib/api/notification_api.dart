import '../models/notification.dart';
import 'api_client.dart';

/// The customer's inbox. Each call returns data or an [ApiError], never both.
class NotificationApi {
  const NotificationApi(this.api);

  final ApiClient api;

  /// Newest first.
  Future<(List<AppNotification>?, ApiError?)> list({int limit = 50}) async {
    final result = await api.get('/notifications?limit=$limit');
    if (result is ApiError) return (null, result);
    try {
      final items = ((result as ApiOk).json['items'] as List).map((e) => AppNotification.fromJson(e as Map<String, dynamic>));
      return (items.toList(), null);
    } catch (_) {
      return (null, const ApiError(status: 200, code: 'BAD_RESPONSE', message: 'Something went wrong. Try again.'));
    }
  }

  /// How many are unread. Null when the call failed (the bell then shows no badge).
  Future<int?> unreadCount() async {
    final result = await api.get('/notifications/unread-count');
    if (result is! ApiOk) return null;
    final data = result.data;
    final count = data is Map ? data['count'] : null;
    return count is int ? count : null;
  }

  Future<bool> markRead(String id) async => await api.post('/notifications/$id/read') is ApiOk;

  Future<bool> markAllRead() async => await api.post('/notifications/read-all') is ApiOk;
}
