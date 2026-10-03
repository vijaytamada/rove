/// Working brand name (temporary). Change it here only.
const String appName = 'Rove';

/// Backend base URL. Android emulator reaches the host machine at 10.0.2.2.
/// Override with: `flutter run --dart-define=API_URL=http://HOST:3001/api/v1`
const String apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:3001/api/v1',
);
