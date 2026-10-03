import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import '../models/user.dart';
import 'token_store.dart';

/// [unreachable]: a session is saved but the server could not be reached (offline or down).
enum AuthStatus { loading, signedOut, signedIn, unreachable }

/// App-wide sign-in state. Screens call these methods and show the returned [ApiError], if any.
class AuthController extends ChangeNotifier {
  AuthController({required this.api, required this.tokens}) {
    api.onSessionExpired = _handleSessionExpired;
  }

  final ApiClient api;
  final TokenStore tokens;

  AuthStatus _status = AuthStatus.loading;
  UserView? _user;

  AuthStatus get status => _status;
  UserView? get user => _user;

  /// Restores a saved session at app start.
  Future<void> init() async {
    if (await tokens.readRefresh() == null) {
      _set(AuthStatus.signedOut, null);
      return;
    }
    final result = await api.get('/me');
    if (result is ApiOk) {
      _set(AuthStatus.signedIn, UserView.fromJson(result.json));
    } else if (await tokens.readRefresh() != null) {
      // The session was not rejected (tokens are only cleared on an explicit rejection), so the
      // server is probably unreachable. Keep the session and let the user retry.
      _set(AuthStatus.unreachable, null);
    } else {
      _set(AuthStatus.signedOut, null);
    }
  }

  /// Tries again after [AuthStatus.unreachable].
  Future<void> retry() async {
    _set(AuthStatus.loading, null);
    await init();
  }

  Future<ApiError?> login(String email, String password) async {
    final result = await api.post('/auth/login', body: {'email': email.trim(), 'password': password}, auth: false);
    return _completeAuth(result);
  }

  Future<ApiError?> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final result = await api.post('/auth/register', auth: false, body: {
      'fullName': fullName.trim(),
      'email': email.trim(),
      'password': password,
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.replaceAll(RegExp(r'\s+'), ''),
    });
    return _completeAuth(result);
  }

  Future<void> logout() async {
    final refresh = await tokens.readRefresh();
    if (refresh != null) await api.post('/auth/logout', body: {'refreshToken': refresh}, auth: false);
    await tokens.clear();
    _set(AuthStatus.signedOut, null);
  }

  Future<ApiError?> updateProfile({required String fullName, String? phone}) async {
    final result = await api.patch('/me', body: {
      'fullName': fullName.trim(),
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.replaceAll(RegExp(r'\s+'), ''),
    });
    return _applyUser(result);
  }

  Future<ApiError?> sendPhoneCode() async {
    final result = await api.post('/auth/otp/send');
    return result is ApiError ? result : null;
  }

  Future<ApiError?> verifyPhoneCode(String code) async {
    final result = await api.post('/auth/otp/verify', body: {'code': code.trim()});
    if (result is ApiError) return result;
    return _applyUser(await api.get('/me'));
  }

  Future<ApiError?> _completeAuth(ApiResult result) async {
    if (result is ApiError) return result;
    final data = (result as ApiOk).json;
    await tokens.save(access: data['accessToken'] as String, refresh: data['refreshToken'] as String);
    _set(AuthStatus.signedIn, UserView.fromJson(data['user'] as Map<String, dynamic>));
    return null;
  }

  ApiError? _applyUser(ApiResult result) {
    if (result is ApiError) return result;
    _set(AuthStatus.signedIn, UserView.fromJson((result as ApiOk).json));
    return null;
  }

  void _handleSessionExpired() => _set(AuthStatus.signedOut, null);

  void _set(AuthStatus status, UserView? user) {
    _status = status;
    _user = user;
    notifyListeners();
  }
}

/// Makes the [AuthController] available to the widget tree.
class AuthScope extends InheritedNotifier<AuthController> {
  const AuthScope({super.key, required AuthController controller, required super.child})
      : super(notifier: controller);

  static AuthController of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AuthScope>()!.notifier!;
}
