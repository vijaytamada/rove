import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:rove_app/api/api_client.dart';
import 'package:rove_app/auth/auth_controller.dart';
import 'package:rove_app/auth/token_store.dart';

const baseUrl = 'http://api.test/api/v1';

Map<String, dynamic> userJson({
  String id = 'u1',
  String name = 'Asha Kumar',
  String role = 'CUSTOMER',
  String? phone,
  bool phoneVerified = false,
  String? email,
}) =>
    {
      'id': id,
      'email': email,
      'fullName': name,
      'role': role,
      'phone': phone,
      'phoneVerified': phoneVerified,
      'status': 'ACTIVE',
    };

http.Response json(int status, Object body) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

/// A signed-in result (`/auth/phone/verify` for a known number, `/auth/phone/signup`).
http.Response authOk({String access = 'access-1', String refresh = 'refresh-1', Map<String, dynamic>? user}) => json(200, {
      'status': 'SIGNED_IN',
      'accessToken': access,
      'refreshToken': refresh,
      'expiresIn': 900,
      'user': user ?? userJson(phone: testPhone, phoneVerified: true),
    });

const testPhone = '+919876543210';

http.Response codeSent() => json(200, {'expiresInSeconds': 300, 'resendAfterSeconds': 30});

http.Response needsName({String token = 'signup-ticket-0123456789'}) =>
    json(200, {'status': 'NEEDS_NAME', 'signupToken': token});

http.Response apiError(int status, String code, String message, {List<String>? details}) =>
    json(status, {'statusCode': status, 'code': code, 'message': message, 'details': ?details});

typedef Handler = Future<http.Response> Function(http.Request request);

class TestEnv {
  TestEnv(Handler handler) {
    requests = [];
    tokens = MemoryTokenStore();
    api = ApiClient(
      baseUrl: baseUrl,
      tokens: tokens,
      client: MockClient((request) async {
        requests.add(request);
        return handler(request);
      }),
    );
    auth = AuthController(api: api, tokens: tokens);
  }

  late final List<http.Request> requests;
  late final MemoryTokenStore tokens;
  late final ApiClient api;
  late final AuthController auth;

  /// Signs in as a known customer through the phone flow.
  Future<void> signIn() async {
    await auth.requestCode(testPhone);
    await auth.verifyCode(testPhone, '123456');
  }

  List<http.Request> to(String path) => requests.where((r) => r.url.path.endsWith(path)).toList();
}
