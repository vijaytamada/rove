import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'auth/auth_controller.dart';
import 'auth/token_store.dart';
import 'config.dart';
import 'screens/root_gate.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final tokens = SecureTokenStore();
  final api = ApiClient(baseUrl: apiUrl, tokens: tokens);
  final auth = AuthController(api: api, tokens: tokens)..init();
  runApp(RoveApp(auth: auth));
}

class RoveApp extends StatelessWidget {
  const RoveApp({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      controller: auth,
      child: MaterialApp(
        title: appName,
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const RootGate(),
      ),
    );
  }
}
