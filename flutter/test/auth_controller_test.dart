import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/auth/auth_controller.dart';
import 'package:rove_app/auth/phone.dart';
import 'package:rove_app/models/user.dart';

import 'test_helpers.dart';

void main() {
  test('starts signed out when no session is saved', () async {
    final env = TestEnv((r) async => json(500, {}));
    await env.auth.init();
    expect(env.auth.status, AuthStatus.signedOut);
    expect(env.requests, isEmpty);
  });

  test('restores a saved session', () async {
    final env = TestEnv((r) async => json(200, userJson(name: 'Asha Kumar')));
    env.tokens
      ..access = 'a'
      ..refresh = 'r';
    await env.auth.init();
    expect(env.auth.status, AuthStatus.signedIn);
    expect(env.auth.user?.fullName, 'Asha Kumar');
  });

  test('falls back to signed out when the saved session is invalid', () async {
    final env = TestEnv((r) async => apiError(401, 'INVALID_REFRESH_TOKEN', 'expired'));
    env.tokens
      ..access = 'a'
      ..refresh = 'r';
    await env.auth.init();
    expect(env.auth.status, AuthStatus.signedOut);
    expect(env.tokens.refresh, isNull);
  });

  test('keeps the saved session and reports unreachable when the server cannot be reached', () async {
    final env = TestEnv((r) async => throw Exception('offline'));
    env.tokens
      ..access = 'a'
      ..refresh = 'r';
    await env.auth.init();
    expect(env.auth.status, AuthStatus.unreachable);
    expect(env.tokens.refresh, 'r');
  });

  test('retry restores the session once the server is back', () async {
    var down = true;
    final env = TestEnv((r) async => down ? throw Exception('offline') : json(200, userJson()));
    env.tokens
      ..access = 'a'
      ..refresh = 'r';
    await env.auth.init();
    expect(env.auth.status, AuthStatus.unreachable);
    down = false;
    await env.auth.retry();
    expect(env.auth.status, AuthStatus.signedIn);
  });

  test('a server error during refresh does not sign the user out', () async {
    final env = TestEnv((r) async => r.url.path.endsWith('/auth/refresh')
        ? apiError(500, 'INTERNAL_ERROR', 'Something went wrong.')
        : apiError(401, 'INVALID_TOKEN', 'expired'));
    env.tokens
      ..access = 'a'
      ..refresh = 'r';
    await env.auth.init();
    expect(env.auth.status, AuthStatus.unreachable);
    expect(env.tokens.refresh, 'r');
  });

  test('requestCode sends the number and reports the resend delay', () async {
    final env = TestEnv((r) async => codeSent());
    final result = await env.auth.requestCode(testPhone);
    expect(result.error, isNull);
    expect(result.resendAfterSeconds, 30);
    expect(env.requests.single.url.path, endsWith('/auth/phone/request'));
    expect(env.requests.single.body, contains('"phone":"$testPhone"'));
    expect(env.requests.single.headers.containsKey('Authorization'), isFalse);
  });

  test('requestCode returns the server error', () async {
    final env = TestEnv((r) async => apiError(429, 'OTP_RESEND_TOO_SOON', 'Wait a moment before requesting another code.'));
    final result = await env.auth.requestCode(testPhone);
    expect(result.error?.code, 'OTP_RESEND_TOO_SOON');
  });

  test('verifyCode signs in a known number and saves the tokens', () async {
    final env = TestEnv((r) async => authOk());
    final result = await env.auth.verifyCode(testPhone, ' 123456 ');
    expect(result.error, isNull);
    expect(result.needsName, isFalse);
    expect(env.auth.status, AuthStatus.signedIn);
    expect(env.auth.user?.email, isNull);
    expect(env.auth.user?.phone, testPhone);
    expect(env.tokens.access, 'access-1');
    expect(env.tokens.refresh, 'refresh-1');
    expect(env.requests.single.body, contains('"code":"123456"'));
  });

  test('verifyCode for a new number asks for a name and does not sign in', () async {
    final env = TestEnv((r) async => needsName());
    await env.auth.init();
    final result = await env.auth.verifyCode(testPhone, '123456');
    expect(result.needsName, isTrue);
    expect(result.signupToken, 'signup-ticket-0123456789');
    expect(env.auth.status, AuthStatus.signedOut);
    expect(env.tokens.access, isNull);
  });

  test('a wrong code returns the error and stays signed out', () async {
    final env = TestEnv((r) async => apiError(400, 'OTP_INVALID', "That code isn't right. Try again."));
    await env.auth.init();
    final result = await env.auth.verifyCode(testPhone, '000000');
    expect(result.error?.code, 'OTP_INVALID');
    expect(env.auth.status, AuthStatus.signedOut);
  });

  test('completeSignup sends the ticket and a trimmed name, then signs in', () async {
    final env = TestEnv((r) async => authOk(user: userJson(name: 'Ravi Shah', phone: testPhone, phoneVerified: true)));
    final error = await env.auth.completeSignup(signupToken: 'signup-ticket-0123456789', fullName: '  Ravi Shah ');
    expect(error, isNull);
    expect(env.requests.single.url.path, endsWith('/auth/phone/signup'));
    expect(env.requests.single.body, contains('"signupToken":"signup-ticket-0123456789"'));
    expect(env.requests.single.body, contains('"fullName":"Ravi Shah"'));
    expect(env.auth.user?.fullName, 'Ravi Shah');
    expect(env.auth.status, AuthStatus.signedIn);
  });

  test('completeSignup reports an expired ticket', () async {
    final env = TestEnv((r) async => apiError(400, 'SIGNUP_EXPIRED', 'This sign-up link has expired.'));
    await env.auth.init();
    final error = await env.auth.completeSignup(signupToken: 'old-ticket-0123456789', fullName: 'Ravi');
    expect(error?.code, 'SIGNUP_EXPIRED');
    expect(env.auth.status, AuthStatus.signedOut);
  });

  test('logout revokes the refresh token and clears the session', () async {
    final env = TestEnv((r) async => r.url.path.endsWith('/auth/logout') ? json(204, {}) : authOk());
    await env.signIn();
    await env.auth.logout();
    expect(env.auth.status, AuthStatus.signedOut);
    expect(env.auth.user, isNull);
    expect(env.tokens.refresh, isNull);
    expect(env.to('/auth/logout').single.body, contains('refresh-1'));
  });

  test('verifying the phone refreshes the user', () async {
    var verified = false;
    final env = TestEnv((r) async {
      if (r.url.path.endsWith('/auth/phone/verify')) return authOk(user: userJson(phone: testPhone));
      if (r.url.path.endsWith('/auth/otp/verify')) {
        verified = true;
        return json(204, {});
      }
      return json(200, userJson(phone: '+919876543210', phoneVerified: verified));
    });
    await env.auth.verifyCode(testPhone, '123456');
    expect(env.auth.user?.phoneVerified, isFalse);

    final error = await env.auth.verifyPhoneCode('123456');

    expect(error, isNull);
    expect(env.auth.user?.phoneVerified, isTrue);
  });

  test('updateProfile sends only the trimmed name', () async {
    final env = TestEnv((r) async => json(200, userJson(name: 'Asha K', phone: testPhone, phoneVerified: true)));
    final error = await env.auth.updateProfile(fullName: '  Asha K ');
    expect(error, isNull);
    expect(env.requests.single.method, 'PATCH');
    expect(env.requests.single.body, contains('"fullName":"Asha K"'));
    expect(env.requests.single.body, isNot(contains('phone')));
    expect(env.auth.user?.fullName, 'Asha K');
  });

  test('changing the phone: the code goes to the new number and the user is updated only on confirm', () async {
    var saved = testPhone;
    final env = TestEnv((r) async {
      if (r.url.path.endsWith('/auth/phone/change/verify')) {
        saved = '+919876500001';
        return json(204, {});
      }
      if (r.url.path.endsWith('/auth/phone/change')) return codeSent();
      return json(200, userJson(phone: saved, phoneVerified: true));
    });
    await env.auth.updateProfile(fullName: 'Asha Kumar');
    expect(env.auth.user?.phone, testPhone);

    final sent = await env.auth.startPhoneChange('+919876500001');
    expect(sent.error, isNull);
    expect(sent.resendAfterSeconds, 30);
    expect(env.to('/auth/phone/change').single.body, contains('"phone":"+919876500001"'));
    expect(env.auth.user?.phone, testPhone); // still the old number

    final error = await env.auth.confirmPhoneChange(' 123456 ');
    expect(error, isNull);
    expect(env.to('/auth/phone/change/verify').single.body, contains('"code":"123456"'));
    expect(env.auth.user?.phone, '+919876500001');
    expect(env.auth.user?.phoneVerified, isTrue);
  });

  test('startPhoneChange reports a number that is taken', () async {
    final env = TestEnv((r) async => apiError(409, 'PHONE_TAKEN', 'An account with this phone number already exists.'));
    final result = await env.auth.startPhoneChange('+919876500001');
    expect(result.error?.code, 'PHONE_TAKEN');
  });

  test('wrong OTP code returns the error', () async {
    final env = TestEnv((r) async => apiError(400, 'OTP_INVALID', "That code isn't right. Try again."));
    final error = await env.auth.verifyPhoneCode('000000');
    expect(error?.code, 'OTP_INVALID');
  });

  test('an expired session signs the user out', () async {
    final env = TestEnv((r) async => r.url.path.endsWith('/auth/phone/verify')
        ? authOk()
        : apiError(401, 'INVALID_REFRESH_TOKEN', 'expired'));
    await env.signIn();
    expect(env.auth.status, AuthStatus.signedIn);

    await env.api.get('/me');

    expect(env.auth.status, AuthStatus.signedOut);
  });

  test('user model reads roles and initials', () {
    final user = UserView.fromJson(userJson(name: 'Asha Kumar', role: 'STATION_EMPLOYEE'));
    expect(user.role, Role.stationEmployee);
    expect(user.role.label, 'Station employee');
    expect(user.initials, 'AK');
  });

  test('phone numbers are normalized to international format', () {
    expect(normalizePhone('98765 43210'), '+919876543210');
    expect(normalizePhone('09876543210'), '+919876543210');
    expect(normalizePhone('91 98765-43210'), '+919876543210');
    expect(normalizePhone('+44 7911 123456'), '+447911123456');
    expect(normalizePhone('0044 7911 123456'), '+447911123456');
    expect(isValidPhone(normalizePhone('12345')), isFalse);
    expect(isValidPhone(normalizePhone('9876543210')), isTrue);
    expect(formatPhone('+919876543210'), '+91 98765 43210');
    expect(formatPhone('+447911123456'), '+447911123456');
  });
}
