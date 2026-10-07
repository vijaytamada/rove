import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/token_store.dart';

sealed class ApiResult {
  const ApiResult();
}

class ApiOk extends ApiResult {
  const ApiOk(this.data);
  final Object? data;

  Map<String, dynamic> get json => data as Map<String, dynamic>;
}

class ApiError extends ApiResult {
  const ApiError({required this.status, required this.code, required this.message, this.details = const []});

  /// 0 means the server could not be reached.
  final int status;
  final String code;
  final String message;
  final List<String> details;

  /// Maps validation messages ("email must be an email") onto form fields.
  Map<String, String> fieldErrors(Iterable<String> fields) {
    final result = <String, String>{};
    if (code == 'VALIDATION_ERROR') {
      for (final line in details) {
        for (final field in fields) {
          if (line.startsWith('$field ') && !result.containsKey(field)) {
            result[field] = line[0].toUpperCase() + line.substring(1);
          }
        }
      }
    }
    if (code == 'EMAIL_TAKEN') result['email'] = message;
    if (code == 'PHONE_TAKEN') result['phone'] = message;
    if (code == 'OTP_INVALID') result['code'] = message;
    return result;
  }
}

/// JSON client for the Rove API. Attaches the access token, and on a 401 renews it once with the
/// refresh token (parallel calls share one renewal) before retrying.
class ApiClient {
  ApiClient({required this.baseUrl, required this.tokens, http.Client? client, this.onSessionExpired})
      : _http = client ?? http.Client();

  final String baseUrl;
  final TokenStore tokens;
  final http.Client _http;

  /// Called when the refresh token is rejected, so the app can return to sign-in.
  void Function()? onSessionExpired;

  Future<bool>? _refreshing;

  Future<ApiResult> get(String path, {bool auth = true}) => _send('GET', path, auth: auth);

  Future<ApiResult> post(String path, {Object? body, bool auth = true, Map<String, String>? headers}) =>
      _send('POST', path, body: body ?? const {}, auth: auth, headers: headers);

  Future<ApiResult> patch(String path, {Object? body}) => _send('PATCH', path, body: body ?? const {});

  Future<ApiResult> _send(
    String method,
    String path, {
    Object? body,
    bool auth = true,
    bool retried = false,
    Map<String, String>? headers,
  }) async {
    final token = auth ? await tokens.readAccess() : null;
    final http.Response response;
    try {
      final request = http.Request(method, Uri.parse('$baseUrl$path'))
        ..headers['Accept'] = 'application/json'
        ..headers.addAll({if (token != null) 'Authorization': 'Bearer $token', ...?headers});
      if (body != null) {
        request.headers['Content-Type'] = 'application/json';
        request.body = jsonEncode(body);
      }
      response = await http.Response.fromStream(await _http.send(request).timeout(const Duration(seconds: 15)));
    } catch (_) {
      return const ApiError(
        status: 0,
        code: 'NETWORK_ERROR',
        message: "Can't reach the server. Check your connection and try again.",
      );
    }

    if (response.statusCode == 401 && auth && !retried && await _refreshTokens()) {
      return _send(method, path, body: body, auth: auth, retried: true, headers: headers);
    }
    return _parse(response);
  }

  ApiResult _parse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return ApiOk(response.body.isEmpty ? null : jsonDecode(response.body));
    }
    try {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return ApiError(
        status: response.statusCode,
        code: json['code'] as String? ?? 'ERROR',
        message: json['message'] as String? ?? 'Something went wrong. Try again.',
        details: (json['details'] as List?)?.map((e) => '$e').toList() ?? const [],
      );
    } catch (_) {
      return ApiError(status: response.statusCode, code: 'ERROR', message: 'Something went wrong. Try again.');
    }
  }

  Future<bool> _refreshTokens() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final refresh = await tokens.readRefresh();
    if (refresh == null) {
      onSessionExpired?.call();
      return false;
    }
    final result = await _send('POST', '/auth/refresh', body: {'refreshToken': refresh}, auth: false);
    if (result is ApiOk) {
      final data = result.json;
      await tokens.save(access: data['accessToken'] as String, refresh: data['refreshToken'] as String);
      return true;
    }
    // Only an explicit rejection ends the session. A network failure or a server error must not
    // sign the user out.
    if (result is ApiError && result.status == 401) {
      await tokens.clear();
      onSessionExpired?.call();
    }
    return false;
  }
}
