# Frontend (Web)

Next.js 16 (App Router) + TypeScript + Tailwind v4. Mobile-first, app-like PWA. Design guide: `docs/UI.md`.

> Next.js 16 differs from older versions. Before changing framework-level code, read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).

## Run
```bash
npm install
npm run dev        # http://localhost:3000 (backend at NEXT_PUBLIC_API_URL, default http://localhost:3001/api/v1)
npm run build
npm run lint
```

## Auth (Phase 2)
- Tokens are stored in **httpOnly cookies** (`rove_at` access, `rove_rt` refresh) set by server actions (`src/app/actions/auth.ts`); browser JavaScript never sees them.
- `src/proxy.ts` (Next 16 "proxy", formerly middleware) renews an expired access token with the refresh cookie and redirects: signed-out users to `/login?next=…`, wrong-role users to their home, signed-in users away from `/login` and `/register`. It reads token claims without verifying them, so it is only a convenience.
- Pages re-check with `requireUser()` / `requireRole()` (`src/lib/dal.ts`), which ask the backend (`GET /me`). The backend enforces access on every API call.
- Route rules and post-login landing pages live in `src/lib/access.ts`. Pages: `/login`, `/register`, `/profile`, `/staff`, `/admin`.
- Local test accounts: `npm run prisma:seed` in `backend/` (see `docs/DEV_SETUP.md`).

## Layout
- `src/app` routes, `manifest.ts` (PWA), `icon.svg`
- `src/components/app` shared form/UI pieces (`TextField`, `SubmitButton`, `StatusChip`, `ButtonLink`, `Wordmark`); `src/components/site` shells (`SiteShell`, `ConsoleShell`, header, nav)
- `src/styles/tokens.css` design tokens (source of truth with `docs/UI.md`)
- `src/lib/config.ts` `APP_NAME` + `API_URL`; `src/lib/api.ts` API client

Pages: `/stations` and `/stations/[id]` (public browsing); console: `/admin` (overview), `/admin/cities`, `/admin/stations[/id]`, `/admin/fleet[/id]`, `/admin/models`, `/admin/staff[/id]`, `/staff` (station console). Admin pages use server actions (`src/app/actions/admin.ts`) and `<ActionForm>` / `Fields` (`src/components/admin`).

Route groups: `(site)` public + customer pages, `(auth)` sign-in/register, `(console)` staff and admin (see `docs/UI.md`).
