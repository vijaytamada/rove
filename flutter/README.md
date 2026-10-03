# Flutter (Mobile)

Customer mobile app (`rove_app`, Android + iOS). It is a separate product from the website: it shares the backend API, the design tokens (`lib/theme/tokens.dart`) and the screen specs in `docs/UI.md`, but is built natively. This app is **customer-only**. Staff, city managers and admins use the website; a separate staff app is planned for later and is not part of this codebase yet.

## What it does now (Phase 2)
Sign in, create an account, home, **Stations** (pick a city, see stations with live availability, open a station to see its available scooters), profile (edit details, verify phone with the mock OTP, sign out). Booking arrives in Phase 4.

## Run
```bash
flutter pub get
flutter run -d <android-emulator-id>      # emulator reaches the host backend at http://10.0.2.2:3001/api/v1
flutter run --dart-define=API_URL=http://<LAN-IP>:3001/api/v1   # physical device
flutter analyze && flutter test
```
Test accounts: `npm run prisma:seed` in `backend/` (see `docs/DEV_SETUP.md`). More: `docs/DEV_SETUP.md`.

## Layout
- `lib/config.dart` `appName`, `apiUrl`
- `lib/api/api_client.dart` JSON client; attaches the access token, renews it on 401 (parallel calls share one renewal) and retries once
- `lib/auth/` `TokenStore` (secure storage in the Android Keystore / iOS Keychain), `AuthController` (sign-in state, `AuthScope`)
- `lib/screens/` `root_gate` (splash / sign-in / app), `login_screen`, `register_screen`, `home_tab`, `stations_tab`, `station_detail_screen`, `profile_tab`
- `lib/api/fleet_api.dart` + `lib/models/fleet.dart` public browsing (no sign-in needed; defensive against unexpected responses)
- `lib/widgets/` shared inputs, buttons, chips, banners (names match the website components)
- `lib/theme/` tokens and Material 3 theme
- `test/` unit tests (API client, auth controller) and widget tests (screens) using an in-memory token store and a fake HTTP client

## Notes
- `main()` must call `WidgetsFlutterBinding.ensureInitialized()` before touching secure storage (otherwise the app stays on the splash screen).
- Android debug builds allow cleartext HTTP (`android/app/src/debug/AndroidManifest.xml`); release builds do not.
- Tokens are only ever stored via `SecureTokenStore`; never log them.
