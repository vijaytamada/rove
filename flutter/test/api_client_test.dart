import 'package:flutter_test/flutter_test.dart';
import 'package:rove_app/api/api_client.dart';

import 'test_helpers.dart';

void main() {
  test('attaches the access token', () async {
    final env = TestEnv((r) async => json(200, {'ok': true}));
    env.tokens.access = 'abc';
    await env.api.get('/me');
    expect(env.requests.single.headers['Authorization'], 'Bearer abc');
  });

  test('does not send the token on unauthenticated calls', () async {
    final env = TestEnv((r) async => json(200, {}));
    env.tokens.access = 'abc';
    await env.api.post('/auth/login', body: {'email': 'a'}, auth: false);
    expect(env.requests.single.headers.containsKey('Authorization'), isFalse);
  });

  test('renews an expired access token once and retries the request', () async {
    final env = TestEnv((r) async {
      if (r.url.path.endsWith('/auth/refresh')) return authOk(access: 'new-access', refresh: 'new-refresh');
      return r.headers['Authorization'] == 'Bearer new-access'
          ? json(200, userJson())
          : apiError(401, 'INVALID_TOKEN', 'expired');
    });
    env.tokens
      ..access = 'old-access'
      ..refresh = 'old-refresh';

    final result = await env.api.get('/me');

    expect(result, isA<ApiOk>());
    expect(env.tokens.access, 'new-access');
    expect(env.tokens.refresh, 'new-refresh');
    expect(env.to('/auth/refresh'), hasLength(1));
  });

  test('parallel expired requests share one refresh', () async {
    final env = TestEnv((r) async {
      if (r.url.path.endsWith('/auth/refresh')) {
        await Future<void>.delayed(const Duration(milliseconds: 30));
        return authOk(access: 'new-access', refresh: 'new-refresh');
      }
      return r.headers['Authorization'] == 'Bearer new-access'
          ? json(200, {'ok': true})
          : apiError(401, 'INVALID_TOKEN', 'expired');
    });
    env.tokens
      ..access = 'old'
      ..refresh = 'r';

    final results = await Future.wait([env.api.get('/a'), env.api.get('/b'), env.api.get('/c')]);

    expect(results.every((r) => r is ApiOk), isTrue);
    expect(env.to('/auth/refresh'), hasLength(1));
  });

  test('ends the session when the refresh token is rejected', () async {
    final env = TestEnv((r) async => r.url.path.endsWith('/auth/refresh')
        ? apiError(401, 'INVALID_REFRESH_TOKEN', 'expired')
        : apiError(401, 'INVALID_TOKEN', 'expired'));
    env.tokens
      ..access = 'old'
      ..refresh = 'bad';
    var expired = 0;
    env.api.onSessionExpired = () => expired++;

    final result = await env.api.get('/me');

    expect(result, isA<ApiError>().having((e) => e.status, 'status', 401));
    expect(env.tokens.access, isNull);
    expect(env.tokens.refresh, isNull);
    expect(expired, 1);
  });

  test('keeps the session when the network is down during refresh', () async {
    var calls = 0;
    final env = TestEnv((r) async {
      calls++;
      if (r.url.path.endsWith('/auth/refresh')) throw Exception('offline');
      return apiError(401, 'INVALID_TOKEN', 'expired');
    });
    env.tokens
      ..access = 'old'
      ..refresh = 'r';
    var expired = 0;
    env.api.onSessionExpired = () => expired++;

    await env.api.get('/me');

    expect(calls, 2);
    expect(env.tokens.refresh, 'r');
    expect(expired, 0);
  });

  test('turns network failures into a friendly error', () async {
    final env = TestEnv((r) async => throw Exception('offline'));
    final result = await env.api.get('/health', auth: false);
    expect(result, isA<ApiError>().having((e) => e.status, 'status', 0).having((e) => e.code, 'code', 'NETWORK_ERROR'));
  });

  test('maps validation details onto form fields', () async {
    final env = TestEnv((r) async => apiError(400, 'VALIDATION_ERROR', 'Validation failed',
        details: ['email must be an email', 'password must be longer than or equal to 8 characters']));
    final result = await env.api.post('/auth/register', auth: false) as ApiError;
    final fields = result.fieldErrors(['fullName', 'email', 'phone', 'password']);
    expect(fields['email'], 'Email must be an email');
    expect(fields['password'], startsWith('Password must be'));
    expect(fields.containsKey('fullName'), isFalse);
  });
}
