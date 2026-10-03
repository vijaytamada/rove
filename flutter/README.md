# Flutter (Mobile)

Customer mobile app (`rove_app`, Android + iOS). Phase 1 is a hello-world with the shared theme and a backend health card; feature work starts after the web MVP flow (Phase 6), reusing the same REST API and the screen specs in `docs/UI.md`.

## Run
```bash
flutter pub get
flutter run -d <android-emulator-id>      # emulator reaches the host backend at http://10.0.2.2:3001/api/v1
flutter run --dart-define=API_URL=http://<LAN-IP>:3001/api/v1   # physical device
flutter analyze && flutter test
```
More: `docs/DEV_SETUP.md`.

## Layout
`lib/config.dart` (`appName`, `apiUrl`) · `lib/theme/tokens.dart` (mirror of web tokens) · `lib/theme/app_theme.dart` · `lib/api/` · `lib/screens/`.

Android debug builds allow cleartext HTTP (`android/app/src/debug/AndroidManifest.xml`); release builds do not.
