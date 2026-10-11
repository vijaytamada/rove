/// A message in the customer's inbox (`GET /notifications`).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.bookingId,
    this.readAt,
  });

  final String id;

  /// The backend's event name, e.g. BOOKING_CONFIRMED. Only used to pick an icon.
  final String type;
  final String title;
  final String body;

  /// The booking the message is about, so it can open it.
  final String? bookingId;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get unread => readAt == null;

  AppNotification asRead(DateTime at) => AppNotification(
        id: id,
        type: type,
        title: title,
        body: body,
        createdAt: createdAt,
        bookingId: bookingId,
        readAt: readAt ?? at,
      );

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        type: json['type'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        bookingId: json['bookingId'] as String?,
        readAt: json['readAt'] == null ? null : DateTime.parse(json['readAt'] as String).toUtc(),
        createdAt: DateTime.parse(json['createdAt'] as String).toUtc(),
      );
}
