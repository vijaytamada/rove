# Handoff: phone + OTP login for customers (in progress)

Branch: `feature/phone-otp-login`. `main` is the last fully working state (Phases 1–3 plus the full test pass, commit `9a54ade`). Read `.ai-context/PROJECT_CONTEXT.md` first, then this file.

## Decision
Customers sign in with **phone number + one-time code** (default and only customer method). Staff, city managers and admins keep **email + password** (separate "Staff sign in" page on the website). Customer accounts need **no password and no email** (email optional, deferred to Phase 8). Mock OTP provider (code `123456`, development only) until Phase 9 brings a real SMS provider (needs India DLT sender registration, so start that early).

Flow: `phone → code → name (only for a new number)`. The account is created only after the name step, using a single-use signup ticket.

## Done on this branch (backend + data + tests)
- **Migration `phone_login`:** `User.email` and `User.passwordHash` are nullable. CHECKs: staff must have email + password; customers must have a phone.
- **Endpoints** (all `@Public()`):
  - `POST /auth/phone/request {phone}` → `{ expiresInSeconds: 300, resendAfterSeconds: 30 }`. Same response for known, unknown and staff numbers (no enumeration); staff numbers are never sent a code.
  - `POST /auth/phone/verify {phone, code}` → `{ status: 'SIGNED_IN', user, accessToken, refreshToken, expiresIn }` or `{ status: 'NEEDS_NAME', signupToken }`.
  - `POST /auth/phone/signup {signupToken, fullName}` → signed-in result; the ticket is single use (10 min).
  - `POST /auth/login` (email + password) now staff only; a customer can never pass it. `POST /auth/register` is **removed**.
  - `/auth/otp/send|verify` (authenticated) still verify a changed profile phone.
- **Abuse limits** (`modules/auth/otp.service.ts`): 30 s resend cooldown, 5 sends per phone per hour, 5 wrong attempts per code, daily cap `OTP_DAILY_SEND_CAP` (default 5000, env) returning 503 `OTP_UNAVAILABLE`. Redis keys: `otp:login:<phone>`, `otp:verify:<userId>`, `otp:cooldown:*`, `otp:sends:<phone>`, `otp:daily:<yyyymmdd>`, `signup:<token>`.
- `UserView.email` is `string | null`. New error codes: `OTP_TOO_MANY_REQUESTS`, `OTP_UNAVAILABLE`, `SIGNUP_EXPIRED`.
- **Seed:** the demo customer is phone-only (`SEED_CUSTOMER_PHONE=+919000000001`, name "Demo Customer"); `SEED_CUSTOMER_EMAIL/PASSWORD` were removed from `.env.example`. The dev database row was already converted (email and password nulled).
- **Tests:** backend 31 unit + 81 e2e pass (`test/auth.e2e-spec.ts` rewritten for the phone flow; `test/helpers.ts` has role-aware `login`: customers via OTP, staff via password; `createUser('CUSTOMER')` makes a verified phone-only customer). `tools/qa/sweep.mjs` 70/70 (customer signs in via OTP).

## Still to do
1. **Website** (currently broken for customers on this branch: `/login` and `/register` still call the removed/password endpoints):
   - `/login` becomes the 3-step phone flow (phone, code, name for new numbers). Phone field with `+91` default; normalise a 10-digit number to `+91…` on the client, server expects strict E.164. Show a resend countdown (`resendAfterSeconds`), a "Change number" action, auto-submit at 6 digits, `autocomplete="one-time-code"`, `inputMode="numeric"`, and the development hint "code is always 123456" (non-production only).
   - New `/login/staff` (the existing email + password form) with a "Staff sign in" link from `/login`; add it to `AUTH_PAGES` in `src/lib/access.ts`; redirect `/register` to `/login`. Header "Create account" becomes "Get started" → `/login`.
   - `UserView.email` nullable in `src/lib/types.ts`; profile page and header must cope with no email (show the phone). Server actions in `src/app/actions/auth.ts` (`login` stays for staff; add request/verify/signup actions; one state machine is simplest).
   - The 15-minute access token / refresh handling in `src/proxy.ts` is unchanged.
2. **Flutter app** (customer-only): replace `LoginScreen`/`RegisterScreen` with the same phone flow; remove password login and `register()` from `AuthController`; add `requestCode`, `verifyCode` (returns signed-in or needs-name + ticket) and `completeSignup`; profile shows the phone (email may be null); update `test/auth_screens_test.dart` and `test/auth_controller_test.dart` (there are 36 tests today; the sign-in/register ones must be rewritten). `AutofillHints.oneTimeCode` is already used; SMS auto-read comes with the real provider (Phase 9).
3. **QA scripts:** `tools/qa/pages.mjs` customer login already uses OTP; re-run all three scripts.
4. **Docs:** `docs/API.md` (new endpoints, removed register), `docs/RBAC.md`, `docs/PROJECT_PLAN.md` decision log (phone OTP for customers, staff passwords, email deferred to Phase 8), `docs/DEV_SETUP.md` (demo customer signs in with the phone + `123456`), `docs/UI.md` (login screens), `docs/PHASES.md` (Phase 9 now replaces the mock provider behind an already-built flow), `docs/TESTING.md` (counts), `.ai-context/PROJECT_CONTEXT.md`.
5. **Full re-test** (`docs/TESTING.md`), then merge the branch into `main`.

## Notes for whoever continues
- Run `cd backend && npm run prisma:deploy` (the new migration) before starting; the dev DB already has it.
- `tools/qa/sweep.mjs` brute-forces a staff login, which locks that account for 15 minutes; clear it with `docker exec rove-redis sh -c "redis-cli --scan --pattern 'login:fail:*' | xargs -r redis-cli del"`.
- Backend `.env` needs no change except the new optional `OTP_DAILY_SEND_CAP`.
- Open question to confirm with the user: whether customers should ever get a password option (current decision: no), and the production SMS provider (Phase 9).
