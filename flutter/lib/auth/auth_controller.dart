import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import '../models/user.dart';
import 'token_store.dart';

/// [unreachable]: a session is saved but the server could not be reached (offline or down).
enum AuthStatus { loading, signedOut, signedIn, unreachable }

class CodeRequestResult {
  const CodeRequestResult({this.error, this.resendAfterSeconds = 30});

  final ApiError? error;
  final int resendAfterSeconds;
}

class VerifyResult {
  const VerifyResult.signedIn()
      : error = null,
        signupToken = null;
  const VerifyResult.needsName(String this.signupToken) : error = null;
  const VerifyResult.failed(ApiError this.error) : signupToken = null;

  final ApiError? error;

  /// Set for a number without an account: pass it to [AuthController.completeSignup].
  final String? signupToken;

  bool get needsName => signupToken != null;
}

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

  // ---- Sign in with a phone number: request a code, verify it, and (new numbers) give a name ----

  /// Sends a sign-in code to [phone] (E.164). The server answers the same for known and unknown numbers.
  Future<CodeRequestResult> requestCode(String phone) async {
    final result = await api.post('/auth/phone/request', body: {'phone': phone}, auth: false);
    if (result is ApiError) return CodeRequestResult(error: result);
    final seconds = (result as ApiOk).json['resendAfterSeconds'];
    return CodeRequestResult(resendAfterSeconds: seconds is int ? seconds : 30);
  }

  /// A known number is signed in (the app switches screens); a new one needs [completeSignup] next.
  Future<VerifyResult> verifyCode(String phone, String code) async {
    final result = await api.post('/auth/phone/verify', body: {'phone': phone, 'code': code.trim()}, auth: false);
    if (result is ApiError) return VerifyResult.failed(result);
    final data = (result as ApiOk).json;
    if (data['status'] == 'NEEDS_NAME') return VerifyResult.needsName(data['signupToken'] as String);
    final error = await _completeAuth(result);
    return error == null ? const VerifyResult.signedIn() : VerifyResult.failed(error);
  }

  /// Creates the account for a new number using the ticket from [verifyCode].
  Future<ApiError?> completeSignup({required String signupToken, required String fullName}) async {
    final result = await api.post(
      '/auth/phone/signup',
      body: {'signupToken': signupToken, 'fullName': fullName.trim()},
      auth: false,
    );
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
