# UI / UX Guide

## 0. Brand (temporary)
Working name: **Rove**. Wordmark: lowercase `rove` in Inter 600, near-black, with a small green accent dot or underline. Placeholder only; read the name from a single `APP_NAME` constant.

## 1. Goal
**Modern, minimal, simple, clean.** One consistent product experience on web and mobile.

## 2. How web and mobile stay the same (the Flipkart approach, not its look)
Flipkart's mobile web ("Flipkart Lite") is a mobile-first **PWA**: the website *is* an app-like experience, built on the same backend APIs and the same design language as the native apps. We use the same ideas:

| Idea | What we do |
|---|---|
| **Mobile-first, single responsive codebase** | Customer web is designed at 360–430 px first; desktop shows the same app in a centered column (max ~480 px). No separate desktop customer design. Wide screens may use a 2–3 column grid on browse screens only. |
| **App-shell + PWA** | Fixed top bar and bottom tab bar, content in between; web manifest, icons, installable ("Add to Home Screen"), fast loads, skeletons. Offline/service-worker is optional, not an MVP need. |
| **One backend, one API contract** | Web and Flutter call the same REST API (`/api/v1`, OpenAPI). Business rules live only in the backend. Neither client calculates prices; both display the backend's quote. |
| **One design language** | Shared **design tokens** (below) + shared **component names and screen specs**. Flutter re-implements the same screens later; it doesn't redesign them. |
| **One screen spec** | Each screen is defined once (screen inventory below). Web is built first; the web screens become the spec for Flutter. |

Staff/admin console is a separate desktop-oriented route group. The station-employee pickup/return screens stay mobile/tablet-friendly.

## 3. Visual style: modern minimal
- **Whitespace first.** Generous padding, one idea per screen, few borders. Separate by space, not lines.
- **Neutral base, one accent.** Near-white background, near-black text, a single green accent used sparingly (availability, battery, success, active tab).
- **Primary action = solid ink (near-black) pill button**; secondary = outline/ghost. One primary button per screen.
- **Big, calm typography.** Prices and codes are large; labels are small and muted. Two weights only (400/600).
- **Soft shapes.** 16 px card radius, pill chips, no heavy shadows (a faint hairline or soft shadow only on floating elements).
- **Thin line icons** (Lucide), consistent 1.5–2 px stroke. No emoji, no gradients, no decorative illustrations beyond simple empty states.
- **Minimal motion.** Short fades/slides (150–250 ms); sheets slide up; no bouncy effects.
- **Plain language.** Short, sentence-case labels ("Book now", "Return scooter"). No exclamation marks.
- Light theme first; dark theme later via the same tokens.

### Design tokens (initial — single source of truth)
Defined as CSS variables in `frontend/src/styles/tokens.css` (consumed by Tailwind) and mirrored in `flutter/lib/theme/tokens.dart`. Change here first.

| Token | Value | Use |
|---|---|---|
| `ink` | `#0B0B0F` | Primary text, primary button |
| `ink-muted` | `#6B7280` | Secondary text |
| `ink-faint` | `#9CA3AF` | Placeholders, captions |
| `bg` | `#FAFAFA` | App background |
| `surface` | `#FFFFFF` | Cards, bars, sheets |
| `line` | `#EEEEF0` | Hairlines, input borders |
| `accent` | `#10B981` | Active tab, available, battery, success |
| `accent-soft` | `#ECFDF5` | Soft accent backgrounds |
| `warning` / `danger` / `info` | `#F59E0B` / `#EF4444` / `#3B82F6` | Statuses only |
| Radius | 16 card/sheet · 12 input/button · 999 chip/pill | |
| Spacing | 4-pt scale; page gutter 20 | |
| Type | Inter; 12 caption · 14 body · 16 title · 20 heading · 32 hero price | |
| Tap target | ≥ 48 px | |

Status chips are soft-tinted (tinted bg + dark text of same hue) and always include text, not color alone.
Vehicle: AVAILABLE accent · RESERVED warning · IN_RIDE info · MAINTENANCE warning · OFFLINE muted.
Booking: PENDING_PAYMENT warning · CONFIRMED info · IN_RIDE info · RETURNED accent · SETTLED accent · CANCELLED/EXPIRED muted · NO_SHOW danger.
Settlement: REFUNDED accent · OUTSTANDING danger · NO_ACTION muted.

## 4. Stack
Web: Tailwind + **shadcn/ui** (Radix) customized to the tokens above. Flutter: Material 3 `ThemeData` built from the same tokens, `google_fonts` Inter. Icons: Lucide (web), `lucide_icons` (Flutter).

## 5. Shared layout patterns & component names (contract between web and Flutter)
| Pattern | Web component | Flutter widget |
|---|---|---|
| Top bar (back, title, action) | `AppBar` | `AppBar` |
| Bottom tabs (Home · Bookings · Profile) | `BottomNav` | `NavigationBar` |
| Scooter / booking cards | `ScooterCard`, `BookingCard` | same names |
| Bottom sheet (duration, breakdown, filters) | `Sheet` | `showModalBottomSheet` |
| Sticky bottom action bar (price + CTA) | `StickyCta` | bottom bar |
| Status chip | `StatusChip` | same |
| Price breakdown | `PriceBreakdown` | same |
| Empty / error / skeleton | `EmptyState`, `ErrorState`, `Skeleton` | same |
| Toast | `sonner` | `SnackBar` |

## 6. Customer screens (MVP)
1. Login / register (+ mock OTP)
2. Home: city/station selector, scooters at the station, active-rental card
3. Stations list → station detail
4. Scooter list (photo, model, battery, range, price/hr, availability)
5. Scooter detail (specs, included km, extra-km and late-fee rules) + sticky "Select duration"
6. Duration & price sheet: durations, price breakdown (rental + refundable deposit = total)
7. KYC status (mock)
8. Payment (mock) → result
9. Booking confirmed: booking code + PIN, station, time
10. My bookings: Active · Upcoming · Past
11. Booking detail: timeline, cancel, settlement summary (deposit, charges, refund/outstanding)
12. Profile

## 7. Staff screens (MVP)
- **Employee (mobile/tablet):** today's queue with search by code/phone; pickup form; return form; settlement result.
- **Manager/Admin (desktop):** cities, stations, fleet table + status, pricing plans, staff; dashboards in Phase 7.

## 8. Frontend structure
```
frontend/src/
  app/(public)/ (customer)/ (staff)/ (admin)/    # route groups with own layouts
  components/ui/       # shadcn primitives
  components/app/      # AppBar, BottomNav, StickyCta, Sheet, ScooterCard, BookingCard, StatusChip, PriceBreakdown, EmptyState
  lib/api/             # typed API client (OpenAPI-generated when stable)
  styles/tokens.css
```

## 9. Rules
- Build from shared components; no one-off styling; no hard-coded colors (tokens only).
- Every list/screen has loading, empty and error states.
- One `formatMoney(paise)` helper; never show raw paise. Always show the refundable deposit as a separate line.
- Never compute money in the client; display backend values.
- Accessibility: labeled inputs, AA contrast, visible focus, status never by color alone.
- Mockup new complex screens before building them.
- Don't build UI for a phase's feature until its endpoints exist.

## 10. Rollout by phase
P1 tokens + app shell + PWA manifest · P2 auth screens · P3 browse + admin fleet · P4 booking flow + My bookings · P5 employee console · P6 settlement UI · P7 dashboards · P8 notification inbox · P9–12 real KYC/payment flows, live map. Flutter customer app after Phase 6, from the web screens.
