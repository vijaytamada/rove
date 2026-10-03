import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/auth/auth_controller.dart';
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

  test('login saves tokens and signs in', () async {
    final env = TestEnv((r) async => authOk());
    final error = await env.auth.login(' asha@example.com ', 'secret-pass');
    expect(error, isNull);
    expect(env.auth.status, AuthStatus.signedIn);
    expect(env.tokens.access, 'access-1');
    expect(env.tokens.refresh, 'refresh-1');
    expect(env.requests.single.body, contains('"email":"asha@example.com"'));
  });

  test('login failure returns the error and stays signed out', () async {
    final env = TestEnv((r) async => apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'));
    await env.auth.init();
    final error = await env.auth.login('a@b.com', 'wrong');
    expect(error?.code, 'INVALID_CREDENTIALS');
    expect(env.auth.status, AuthStatus.signedOut);
    expect(env.tokens.access, isNull);
  });

  test('register sends a normalized phone and signs in', () async {
    final env = TestEnv((r) async => authOk(user: userJson(phone: '+919876543210')));
    final error = await env.auth.register(
      fullName: ' Asha Kumar ',
      email: 'asha@example.com',
      password: 'secret-pass',
      phone: '+91 98765 43210',
    );
    expect(error, isNull);
    expect(env.requests.single.body, contains('"phone":"+919876543210"'));
    expect(env.requests.single.body, contains('"fullName":"Asha Kumar"'));
    expect(env.auth.user?.phone, '+919876543210');
  });

  test('register omits an empty phone', () async {
    final env = TestEnv((r) async => authOk());
    await env.auth.register(fullName: 'A', email: 'a@b.com', password: 'secret-pass', phone: '  ');
    expect(env.requests.single.body, isNot(contains('phone')));
  });

  test('logout revokes the refresh token and clears the session', () async {
    final env = TestEnv((r) async => r.url.path.endsWith('/auth/logout') ? json(204, {}) : authOk());
    await env.auth.login('a@b.com', 'secret-pass');
    await env.auth.logout();
    expect(env.auth.status, AuthStatus.signedOut);
    expect(env.auth.user, isNull);
    expect(env.tokens.refresh, isNull);
    expect(env.to('/auth/logout').single.body, contains('refresh-1'));
  });

  test('verifying the phone refreshes the user', () async {
    var verified = false;
    final env = TestEnv((r) async {
      if (r.url.path.endsWith('/auth/login')) return authOk(user: userJson(phone: '+919876543210'));
      if (r.url.path.endsWith('/auth/otp/verify')) {
        verified = true;
        return json(204, {});
      }
      return json(200, userJson(phone: '+919876543210', phoneVerified: verified));
    });
    await env.auth.login('a@b.com', 'secret-pass');
    expect(env.auth.user?.phoneVerified, isFalse);

    final error = await env.auth.verifyPhoneCode('123456');

    expect(error, isNull);
    expect(env.auth.user?.phoneVerified, isTrue);
  });

  test('wrong OTP code returns the error', () async {
    final env = TestEnv((r) async => apiError(400, 'OTP_INVALID', "That code isn't right. Try again."));
    final error = await env.auth.verifyPhoneCode('000000');
    expect(error?.code, 'OTP_INVALID');
  });

  test('an expired session signs the user out', () async {
    final env = TestEnv((r) async => r.url.path.endsWith('/auth/login')
        ? authOk()
        : apiError(401, 'INVALID_REFRESH_TOKEN', 'expired'));
    await env.auth.login('a@b.com', 'secret-pass');
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
}
