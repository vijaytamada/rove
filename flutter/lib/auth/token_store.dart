import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class TokenStore {
  Future<String?> readAccess();
  Future<String?> readRefresh();
  Future<void> save({required String access, required String refresh});
  Future<void> clear();
}

/// Tokens live in the platform keystore (Android Keystore / iOS Keychain), never in plain prefs.
class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  static const _accessKey = 'rove_access_token';
  static const _refreshKey = 'rove_refresh_token';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccess() => _read(_accessKey);

  @override
  Future<String?> readRefresh() => _read(_refreshKey);

  /// Keystore data can become unreadable (app reinstall, restored backup, OS key reset).
  /// Treat that as "signed out" and wipe the unreadable entries rather than failing.
  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      try {
        await _storage.deleteAll();
      } catch (_) {}
      return null;
    }
  }

  @override
  Future<void> save({required String access, required String refresh}) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

/// For tests.
class MemoryTokenStore implements TokenStore {
  String? access;
  String? refresh;

  @override
  Future<String?> readAccess() async => access;

  @override
  Future<String?> readRefresh() async => refresh;

  @override
  Future<void> save({required String access, required String refresh}) async {
    this.access = access;
    this.refresh = refresh;
  }

  @override
  Future<void> clear() async {
    access = null;
    refresh = null;
  }
}
