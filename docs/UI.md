# UI / UX Guide

## 0. Brand (temporary)
Working name: **Rove**. Wordmark: lowercase `rove` in Inter 600, near-black, with a small green accent dot or underline. Placeholder only; read the name from a single `APP_NAME` constant.

## 1. Goal
**Modern, minimal, simple, clean.** One consistent product experience on web and mobile.

## 2. Web and mobile: one product, two interfaces
**Revised 2026-10-03.** The website is a real, responsive website used by customers, station employees, city managers and admins. The Flutter app is a separate, native customer app. They are not pixel copies; they share the backend, the design language and the screen specs.

| Topic | Website (Next.js) | Mobile app (Flutter) |
|---|---|---|
| Users | Customers, station employees, city managers, super admins | **Customers only.** Staff and admins use the website; a separate staff app may be planned later (decision 2026-10-03) |
| Layout | Responsive. Desktop: top navigation, wide content (max 6xl), split-screen sign-in. Phones: compact header + bottom tabs | Native phone UI: app bar, bottom navigation, sheets |
| Staff/admin | Console layout: sidebar on desktop, top bar with links on phones | Not in the app |
| Install | Optional PWA (manifest) | App store build |

What stays shared:
- **One backend and API contract** (`/api/v1`). Neither client calculates prices; both display backend values.
- **One design language:** the same tokens (section 3), type, spacing and tone, so they feel like the same brand.
- **One screen spec:** customer screens are defined once (section 6). Each client implements them in its own native way; the website is built first, Flutter follows the same flows.
- **Same component names** where a component exists in both (`ScooterCard`, `BookingCard`, `StatusChip`, `PriceBreakdown`).

Web layout groups: `(site)` public + customer pages (header, footer, bottom tabs on phones), `(auth)` customer sign-in and staff sign-in (split screen), `(console)` staff and admin (sidebar).

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
1. Sign in (phone + code). One screen with three steps, no separate "create account": **phone** (fixed `+91` prefix, then 10 digits; India only for now) -> **code** (six separate boxes, one per digit; typing advances, Backspace goes back, pasting or autofill fills them all; submits by itself at the sixth digit; resend countdown, "Change number") -> **name**, only for a number we haven't seen (this creates the account). Development builds show "the code is always 123456". The website adds a "Staff sign in" link to `/login/staff` (email + password, for station employees, managers and admins); `/register` redirects to `/login`. The Flutter app is customer-only, so it has no staff sign-in
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

### Admin console layout rules (2026-10-04)
- Lists are **full width**. Nothing sits beside a table. "Add ..." is a button in the page header (`<AddDialog>`) that opens a modal form; the modal closes itself after a successful save (`ActionForm` calls the dialog's close).
- Forms use `<FormGrid>`: two columns from 640px, one on phones. Give a field `wide` to span both.
- Forms show only what applies. The staff form (`<StaffCreateForm>`) shows the stations picker for a station employee, the cities picker for a city manager, and neither for a super admin. A city manager only gets "Station employee" (no role picker).
- Tables are `<TableWrap>` + `<Td label="...">`. Below 768px each row reflows into a labelled card (CSS class `rtable` in `globals.css`), so nothing scrolls sideways on phones. Pass `label` on every data cell; leave it off the actions cell.
- The sidebar appears from 1280px; below that the console uses the top bar with scrolling links.
- One-time codes use `<OtpInput>` (web) / `OtpField` (Flutter): one box per digit.

### Booking flow (2026-10-07)
- **City selection never lists cities side by side.** One city: a plain label, chosen for you. Several: one button with the current city that opens a list (website `<CitySelect>` in a `<Modal>`, app bottom sheet; a search box from 8 cities). Same on both clients.
- Station list: availability chip (`N available`, `None available`, or `Closed now` outside opening hours). Scooter card: model, battery, range, speed, `₹49 / hour` and **Select**; a scooter without a price says "Not open for booking yet".
- Booking screen (`/book/[vehicleId]`, app `BookScreen`): scooter details, "Rates and rules", **When do you start?** (Start now / Pick a time, up to 7 days ahead, in city time), **How long?** (1, 2, 3, 4, 6, 8, 12 hours, 1 day), **Your price** (rental, refundable deposit as its own line, total; error text from the backend when the slot is unavailable). The bar at the bottom (`StickyCta`) shows the total and **Continue**; on phones the tab bar is hidden on checkout pages. Signed-out visitors see "Sign in to book" and come back with their choices.
- Continue goes to the identity check (once: consent checkbox, "Verify me"), then **Pay to confirm**: summary, hold countdown (10:00), demo note, "Pay ₹X". A failed payment shows the reason and allows a retry; when the hold runs out Pay is disabled and "Book it again" appears.
- Booking detail: status chip, **booking code and pickup PIN** (large) once confirmed, green "Booking confirmed" note, pickup place and time, price, "Rates you agreed to", timeline, **Pay now** while unpaid, **Cancel booking** with a confirmation that spells out the refund (numbers from the backend).
- My bookings: Active · Upcoming · Past. Home shows the booking that needs attention. Profile shows the identity check status.
- Admin console: **Pricing** page (list, add dialog, edit page; rupees in forms, paise in the API).

### Profile (2026-10-04)
- Details are **read-only by default**: a label, the value and a pencil button. Nothing looks like an input until the pencil is pressed.
- **Name:** the pencil turns the row into a text box with Save and Cancel (inline, no popup).
- **Phone:** the pencil opens a modal (web `<Modal>`) or bottom sheet (Flutter) in two steps: (1) new `+91` number, "Send code"; (2) the six code boxes, which submit at the sixth digit, with a resend countdown and "Change number". The number is saved only after the code is right (`POST /auth/phone/change`, then `/auth/phone/change/verify`); a wrong code leaves the old number untouched. A saved but unverified number shows "Not verified" and "Verify now", which skips to step 2.
- Email (staff) is read-only: "Used to sign in. Ask an admin to change it."
- `<Modal>` (`components/app/Modal.tsx`) is the one dialog primitive; `<AddDialog>` is built on it.

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
