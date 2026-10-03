# Dev Setup & Run Guide

How to install prerequisites and start every part of Rove locally (Windows 11). Commands work in **PowerShell** or **Git Bash**; use the repo root `D:\Source Codes\vibe-coding` as the starting point.

## 1. Prerequisites (one time)
| Tool | Needed for | Check |
|---|---|---|
| Node.js 20+ (tested on 24) + npm | backend, web | `node --version` |
| Docker Desktop (running) | Postgres + Redis | `docker --version`, then `docker info` |
| Git | version control | `git --version` |
| Flutter SDK (stable) | mobile app | `flutter doctor` |
| Android Studio + Android SDK | Android emulator for Flutter | `flutter doctor` → "Android toolchain" ✓ |

Notes:
- `flutter doctor` may flag **Visual Studio** — ignore it; it's only needed for Windows desktop apps, which we don't build.
- SDK needed: Android SDK Platform 35+ (any installed 35/36 is fine), build-tools, emulator, and an **x86_64 system image**. Current devices use Android 15 (API 35) *Google APIs* (not Play Store; lighter and more stable).
- Virtual devices: `Rove_Pixel` (Pixel 8, main test device) and `Rove_Pixel_10` (newer-device check). **Run one emulator at a time** (4 GB RAM each).

## 2. First-time project setup
```bash
cp .env.example .env                 # repo root; defaults work for local dev
cd backend && npm install            # also generates nothing yet; Prisma client is generated on build/start
cd ../frontend && npm install
cd ../flutter && flutter pub get
```

## 3. Start everything (use separate terminals)
Order matters: **infra → backend → web → emulator → Flutter**.

| Terminal | Folder | Command | Result |
|---|---|---|---|
| **T1** infra (run once, then close) | `infra/` | `docker compose up -d` | Postgres `:5442`, Redis `:6389` |
| **T2** backend | `backend/` | `npm run prisma:generate` (first time / after schema change), `npm run prisma:deploy` (apply migrations), then `npm run start:dev` | API `http://localhost:3001/api/v1`, Swagger `http://localhost:3001/api/docs` |
| **T3** web | `frontend/` | `npm run dev` | `http://localhost:3000` |
| **T4** mobile | `flutter/` | `flutter emulators --launch Rove_Pixel`, wait for the home screen, then `flutter run -d <emulator-id>` | App on the emulator |

**Seed users (once, after migrations):** `cd backend && npm run prisma:seed` creates a super admin and a demo customer. The admin's email and password come from `SEED_ADMIN_*` in `.env` (default `admin@rove.local`). The demo customer has no email or password: they sign in with the phone number in `SEED_CUSTOMER_PHONE` (default `+919000000001`) and the mock code `123456`. Safe to re-run. Cities, stations and staff seeds arrive in Phase 3.

`npm run prisma:seed` also creates 2 cities (Bengaluru, Hyderabad), 5 stations, 3 vehicle models and 12 scooters, a city manager per city (`manager.blr@rove.local`, `manager.hyd@rove.local`) and a station employee per station (`employee.indiranagar@rove.local`, `employee.koramangala@rove.local`, `employee.mg-road@rove.local`, `employee.hitech-city@rove.local`, `employee.banjara-hills@rove.local`). Staff share the password in `SEED_STAFF_PASSWORD`.

Customers sign in with their phone number and a code, on the website (http://localhost:3000/login) and in the Flutter app; a new number creates an account after asking for a name. Staff, city managers and admins sign in with email and password at http://localhost:3000/login/staff (the website only; the Flutter app is customer-only).

Mock OTP: verification codes are always `123456` and are logged by the backend. Never enabled in production (the app refuses to start with `OTP_PROVIDER=mock` when `NODE_ENV=production`).

Backend takes ~15–20 s to start. Check it: open `http://localhost:3001/api/v1/health` → `{"status":"ok","checks":{"database":"up","redis":"up"}}`.
`flutter devices` shows the emulator id (e.g. `emulator-5554`). You can also start the emulator from Android Studio → Device Manager (▶).

## 4. Flutter run modes
| Mode | Command | Use |
|---|---|---|
| **App on Android emulator** (our target) | `flutter run -d emulator-5554` | Daily mobile development. Reaches the host backend at `http://10.0.2.2:3001/api/v1` (built-in default) |
| App on a physical Android phone | `flutter run --dart-define=API_URL=http://<PC-LAN-IP>:3001/api/v1` | Phone on the same Wi-Fi; allow ports 3001 in Windows Firewall |
| Flutter **web** (Chrome) | *not set up* | We use the **Next.js** site as the web product. Flutter web would need `flutter create --platforms=web .` and CORS changes — deliberately skipped |
| Flutter Windows desktop | *not supported* | Requires Visual Studio; not needed |

While `flutter run` is active: `r` hot reload, `R` hot restart, `q` quit.
Release builds block plain HTTP; cleartext is enabled only in the Android **debug** manifest.

## 5. Verify
- Web home shows Backend status: API / Database / Redis **Up**.
- App on emulator shows the same card; **Refresh** re-checks.
- Quality checks:
  ```bash
  cd backend  && npm test && npm run test:e2e && npm run lint && npm run build   # e2e needs T1 running
  cd frontend && npm run lint && npm run build
  cd flutter  && flutter analyze && flutter test
  ```

## 6. Stop
`Ctrl+C` in T2/T3/T4. Infra: `cd infra && docker compose down` (keeps data) or `docker compose down -v` (deletes data).

## 7. Ports
| Port | Service |
|---|---|
| 3000 | Web (Next.js) |
| 3001 | Backend API |
| 5442 | Postgres (host side; 5432 inside the container) |
| 6389 | Redis (host side; 6379 inside the container) |
Other local projects use 5432/6379, which is why Rove uses 5442/6389. Change via `POSTGRES_PORT` / `REDIS_PORT` and `DATABASE_URL` / `REDIS_URL` in `.env`.

## 8. Troubleshooting
| Symptom | Fix |
|---|---|
| Backend: "Invalid environment configuration" | `.env` missing at repo root → `cp .env.example .env` |
| Backend: Prisma client not found | `cd backend && npm run prisma:generate` |
| Health shows `database: down` | Docker Desktop not running / `docker compose up -d` not done / port clash |
| Web shows "Backend: Unreachable" | Backend (T2) not running or still starting |
| App shows "Unreachable" on emulator | Backend not running, or wrong `API_URL`; emulator must use `10.0.2.2`, not `localhost` |
| Emulator crashes or freezes | Close other emulators; 4 GB RAM each. If it persists check GPU: AVD `hw.gpu.mode` (`host` = GPU, `swiftshader_indirect` = software) |
| `flutter devices` shows emulator "offline" | Wait for boot to finish; `adb kill-server` then `adb devices` |
| Android Studio device dialog hides the system image | Pixel 10 profile wants API 36+; API 35 images show as "unsupported" there but still work |

## 9. Branches and workflow
Two long-lived branches, **kept at the same commit**, plus short-lived feature branches:

| Branch | Purpose |
|---|---|
| `main` | Last fully tested, releasable state. Same commit as `dev` |
| `dev` | Integration branch. Same commit as `main`; feature branches start here |
| `feature/<name>` | Where all changes are made. Deleted after merging |

1. Start: `git checkout dev` then `git checkout -b feature/<name>`. Commit code and docs there.
2. When the feature is stable, run the checks in `docs/TESTING.md` (backend tests, website lint + build, Flutter tests + analyze, the three `tools/qa` scripts).
3. Merge into `dev`: `git checkout dev`, `git merge --no-ff feature/<name>`.
4. Bring `main` level: `git checkout main`, `git merge --ff-only dev`, then `git checkout dev`.
5. `git branch -d feature/<name>`.

No remote is configured yet. To publish, add one (`git remote add origin <url>`) and push both branches (`git push -u origin main dev`).
