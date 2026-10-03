import 'dart:convert';
import 'dart:io';

import '../config.dart';

class HealthReport {
  const HealthReport({required this.status, required this.database, required this.redis});

  final String status;
  final String database;
  final String redis;

  factory HealthReport.fromJson(Map<String, dynamic> json) {
    final checks = json['checks'] as Map<String, dynamic>;
    return HealthReport(
      status: json['status'] as String,
      database: checks['database'] as String,
      redis: checks['redis'] as String,
    );
  }
}

typedef HealthFetcher = Future<HealthReport?> Function();

/// Returns null when the backend is unreachable.
Future<HealthReport?> fetchHealth() async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  try {
    final request = await client.getUrl(Uri.parse('$apiUrl/health'));
    final response = await request.close();
    if (response.statusCode != 200) return null;
    final body = await response.transform(utf8.decoder).join();
    return HealthReport.fromJson(jsonDecode(body) as Map<String, dynamic>);
  } catch (_) {
    return null;
  } finally {
    client.close();
  }
}
