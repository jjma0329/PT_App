# Project Research Summary

**Project:** PT App — Personal Trainer Marketing + Booking Site
**Domain:** Single-trainer booking site with Google Calendar two-way sync
**Researched:** 2026-03-11
**Confidence:** MEDIUM (stack/features/architecture confirmed against codebase; some library versions not live-verified)

## Executive Summary

This is a single-trainer marketing and booking website that must allow prospective clients to discover the trainer, select an available time slot drawn live from Google Calendar, and confirm a session — all without creating an account. The existing codebase is a working Express + Neon PostgreSQL backend with a vanilla HTML/CSS frontend that must be migrated to React + Tailwind. The core new capability to build is a Google Calendar-backed availability and booking system. This is a well-understood problem domain with clear implementation patterns: OAuth2 refresh token stored in the database, Google Calendar FreeBusy API for slot availability, a conflict guard on submission, and Resend for transactional email.

The recommended approach is a phased build: migrate the existing vanilla frontend to React + Tailwind first (establishing conventions and fixing known security issues), then layer in the Google Calendar integration server-side, then build the booking API and database models, and finally assemble the booking UI components. This order respects architectural dependencies — the slot picker UI cannot be built until the `/api/slots` endpoint exists, and that endpoint cannot exist until the OAuth2 credential flow is established. Skipping the migration phase or attempting to build the booking flow on top of the existing vanilla HTML would produce structural debt that compounds through every subsequent phase.

The key risks are concentrated around Google OAuth2 token persistence, timezone handling, and double-booking race conditions. All three are easy to implement incorrectly and expensive to fix in production. The research identifies these pitfalls in detail and prescribes specific prevention patterns (database-persisted refresh token, UTC storage with `Intl.DateTimeFormat` display, unique DB constraint plus freebusy re-check at submission). Two additional security issues already present in the codebase — HTML injection in email templates and wildcard CORS — must be fixed in the migration phase before being carried forward into booking email templates.

## Key Findings

### Recommended Stack

The existing stack (React 19, TypeScript 5, Vite 7, Express 5, Prisma 7, Neon PostgreSQL, Resend) is locked and must not change. New libraries required are: `tailwindcss` + `@tailwindcss/vite` (Vite plugin integration, no PostCSS config needed), `googleapis` (official Google Node.js client, handles OAuth2 and Calendar API), `clsx` + `tailwind-merge` (conditional class composition), `react-day-picker` + `date-fns` (calendar date picker for booking UI), `express-rate-limit` (rate limiting on write endpoints), and `zod` (runtime input validation). No component library is recommended — the dark gym aesthetic is best achieved with hand-crafted Tailwind.

Prisma 7 uses a new generator syntax (`provider = "prisma-client"`, output to `src/generated/prisma`). This is confirmed from the existing `schema.prisma`. All new Prisma work must import from that path — never from the legacy `@prisma/client`. The Prisma singleton pattern (one `PrismaClient` instance in `server/lib/prisma.ts`) is mandatory given Neon's connection limits.

**Core technologies (new additions):**
- `googleapis@^144`: Google Calendar API + OAuth2 client — the official library, handles token refresh automatically
- `tailwindcss@^4.1` + `@tailwindcss/vite`: Tailwind v4 via Vite plugin, no config file required for basic use
- `react-day-picker@^9` + `date-fns@^4`: Date selection UI with full React 19 compatibility
- `express-rate-limit@^7`: Rate limiting for `/api/bookings` and `/api/contact` — addresses confirmed gap in codebase
- `zod@^3.24`: Runtime validation for booking inputs before DB write or Calendar event creation
- `clsx@^2.1` + `tailwind-merge@^3`: Conditional class merging per CLAUDE.md mandate

### Expected Features

The full feature dependency chain is: Google Calendar OAuth2 setup → availability slot read API → date/slot picker UI → booking form → DB persist + Calendar event write + confirmation emails. Nothing in the booking flow works without the OAuth2 setup completing first. Session type selection can be added at any point but should be included early to avoid a schema migration later.

**Must have (table stakes):**
- Google Calendar OAuth2 configured with refresh token persisted to DB — prerequisite for all availability features
- `/api/slots` endpoint returning open time windows for a given date via FreeBusy API
- Date picker + time slot grid UI using `react-day-picker` + custom Tailwind slot buttons
- Session type selector (intro, 60-min, 90-min) — affects event duration and email copy
- No-account booking form (name, email, phone, session type, optional notes)
- Double-booking protection: unique DB constraint + freebusy re-check at submission
- Google Calendar event write on confirmed booking
- Booking record persisted to Neon via Prisma
- Confirmation email to client and notification email to trainer via Resend
- On-screen confirmation state after successful booking
- Mobile-responsive booking flow — non-negotiable given traffic distribution
- Rate limiting on booking and contact endpoints

**Should have (competitive differentiators):**
- Branded dark gym-aesthetic booking UI — reinforces brand at highest-intent moment
- Slot refresh on form focus — prevents stale slots after 5+ minutes on the page
- Timezone auto-detection via `Intl.DateTimeFormat` — show slots in visitor's local time
- Specific error states for slot conflicts vs. server errors — keeps users in the funnel
- 24-hour reminder email — requires a cron job, add after booking flow is stable

**Defer to v2+:**
- Online payment via Stripe — changes the booking flow substantially; collect in-person for v1
- Cancellation/rescheduling self-service — trainer handles via Google Calendar + direct message
- Client booking history lookup (no-password) — add when clients request it
- Package/recurring session booking — only relevant after trainer scales beyond solo capacity
- SMS reminders — compliance overhead (TCPA) not justified at v1 scale

### Architecture Approach

The architecture is a React SPA (Vite build) communicating with an Express REST API via fetch calls proxied through Vite in development. The Express backend talks to Google Calendar API (via `googleapis`) and Neon PostgreSQL (via Prisma). All Google credentials stay server-side — the frontend never touches Google APIs directly. The service layer (`calendarService.ts`, `bookingService.ts`, `emailService.ts`) isolates business logic from controllers. Custom hooks (`useAvailableSlots`, `useBooking`) isolate fetch logic from UI components. A single `api.ts` module in the frontend centralizes all fetch calls and enforces the `{ success, data, error }` response shape.

**Major components:**
1. `server/lib/googleAuth.ts` — OAuth2Client factory; reads refresh token from DB; called by calendarService
2. `server/services/calendarService.ts` — all Google Calendar API calls (freebusy query, events.insert); single mock point for tests
3. `server/services/bookingService.ts` — orchestrates the three-way side effect: DB write + Calendar event + confirmation emails
4. `src/hooks/useAvailableSlots.ts` — fetches `/api/slots` for selected date; re-fetches on date change
5. `src/hooks/useBooking.ts` — submits booking, manages loading/error state; calls `/api/bookings`
6. `src/components/booking/` — SlotPicker, BookingForm, BookingConfirmation (modal container and steps)
7. `prisma/schema.prisma` — new Booking and OAuthToken models added alongside existing ContactSubmission

### Critical Pitfalls

1. **OAuth refresh token lost after server restart** — persist the full token object to an `OAuthToken` DB row immediately after OAuth callback; never store only in `.env`; detect `invalid_grant` 401s and surface re-auth instructions
2. **Double-booking race condition** — add a `@@unique` constraint on the booking's time slot fields in the Prisma schema; re-check freebusy at submission time server-side; handle Prisma `P2002` unique constraint violations with a 409 response
3. **Timezone mismatch across boundaries** — store all times in UTC in the DB; send UTC to the frontend; display using `Intl.DateTimeFormat` in the visitor's local timezone; always include `timeZone` in Google Calendar event `start`/`end` objects
4. **Stale availability slots** — treat frontend slot display as a hint only; always re-query Google Calendar freebusy server-side at submission time before creating the event
5. **Email HTML injection (already present in codebase)** — escape all `req.body` values before interpolating into HTML email strings; fix in migration phase before any booking email templates are written
6. **PrismaClient instantiated per controller (already present)** — refactor `contactController.ts` to import from a shared `server/lib/prisma.ts` singleton before adding any new controllers; running `new PrismaClient()` multiple times exhausts Neon's connection pool

## Implications for Roadmap

Based on the dependency chain identified across all four research files, six phases emerge naturally. The order is non-negotiable in places — OAuth2 must precede the slots API, which must precede the slot picker UI.

### Phase 1: React + Tailwind Migration and Security Baseline
**Rationale:** The existing vanilla HTML frontend must be migrated before any new booking components can be built. This phase also fixes the two confirmed security issues (email HTML injection, wildcard CORS) so they are not carried into booking email templates. Tailwind setup must be verified working before any component work begins. The PrismaClient singleton refactor happens here to prevent the existing pattern from propagating to new controllers.
**Delivers:** React component tree with Tailwind styling replacing all 10 vanilla CSS files; fixed email escaping; tightened CORS; singleton PrismaClient; working contact form in React with preserved API contract
**Addresses:** Mobile-responsive layout foundation, branded dark aesthetic, `Clear CTA from services/pricing sections`
**Avoids:** Email HTML injection (Pitfall 9), Tailwind setup failure (Pitfall 6), React migration breaking API contract (Pitfall 5), PrismaClient per controller (Pitfall 7)

### Phase 2: Database Schema + Prisma Models
**Rationale:** The Booking and OAuthToken models must exist before any booking or calendar code can be written. Schema design decisions — particularly the unique constraint on booking time slots — must be made before the booking endpoint is built, not retrofitted.
**Delivers:** `Booking` model with unique constraint on `(slotStart, slotEnd)`, `OAuthToken` model for Google refresh token storage, Prisma migration applied to Neon; `postinstall` script for `prisma generate`
**Uses:** Prisma 7 generator pattern (`provider = "prisma-client"`, import from `src/generated/prisma`)
**Avoids:** Double-booking race condition (Pitfall 2 — schema design phase), missing `postinstall` script (Integration gotcha)

### Phase 3: Google Calendar Integration (Server-Side)
**Rationale:** The slots API is the dependency for the booking UI. It cannot be built until Google OAuth2 is configured and the freebusy query is working. Verify this phase in isolation (via curl/Postman) before building any UI against it. The OAuth callback must include `state` parameter validation from the start.
**Delivers:** `server/lib/googleAuth.ts` (OAuth2Client factory), `server/services/calendarService.ts` (freebusy query + events.insert), `/api/auth/google` and `/api/auth/google/callback` routes (one-time trainer setup), `GET /api/slots?date=YYYY-MM-DD` endpoint returning available time windows
**Uses:** `googleapis@^144`, OAuth2 stored refresh token pattern, Google Calendar FreeBusy API
**Avoids:** OAuth refresh token lost (Pitfall 1), stale availability at submission (Pitfall 4), OAuth callback CSRF (Pitfall 8), service account anti-pattern, events.list anti-pattern

### Phase 4: Booking API + Email Extensions
**Rationale:** With the schema and Calendar integration in place, the booking endpoint can be built safely. The conflict guard (freebusy re-check at submission), rate limiting, Zod validation, and email templates all belong here. These must ship together — an unprotected endpoint is worse than no endpoint.
**Delivers:** `POST /api/bookings` with Zod validation, conflict guard (freebusy re-check before events.insert), `bookingService.ts` orchestrating DB write + Calendar event + emails, extended `emailService.ts` with booking confirmation and trainer alert templates, `express-rate-limit` on `/api/bookings`
**Implements:** bookingService.ts, three-way side effect orchestration
**Avoids:** Double-booking race condition (Pitfall 2 — submission layer), slot flooding (Pitfall 10), email HTML injection in booking templates (Pitfall 9), stale availability at submission (Pitfall 4)

### Phase 5: Booking UI
**Rationale:** Only now that the backend API contract is real and verified can the booking UI components be assembled. Using real API data (not mocks) from the start prevents contract drift. Timezone display and mobile layout are included in this phase, not deferred — they are core to usability.
**Delivers:** `SlotPicker` (date picker + time slot grid), `BookingForm` (name, email, phone, session type, notes), `BookingConfirmation` (success state), `useAvailableSlots` and `useBooking` hooks, `src/lib/api.ts` typed fetch wrappers, session type selector, on-screen confirmation state, timezone display via `Intl.DateTimeFormat`
**Uses:** `react-day-picker@^9`, `date-fns@^4`, `clsx`, `tailwind-merge`, Tailwind dark theme
**Avoids:** Stale slot display (re-fetch on date change via hook), generic error states (distinguish 409 conflict from 500 server error), mobile booking flow issues

### Phase 6: Production Hardening + Deployment
**Rationale:** Security and operational concerns that are cheap to defer during development but mandatory before real traffic hits the site. CORS lockdown, Resend domain verification, and Vite production build verification all belong here.
**Delivers:** CORS restricted to production frontend origin, Resend sender domain verified (not `onboarding@resend.dev`), Vite production build tested with all Tailwind classes present, CORS tightened, deployment configuration (Express serves built frontend or reverse proxy)
**Avoids:** Wildcard CORS in production, Resend sandbox sender reaching real clients, Tailwind purge issues in production build

### Phase Ordering Rationale

- Phase 1 before Phase 2: React conventions must be established before new schema/controller work begins; security issues must be fixed before they propagate
- Phase 2 before Phase 3: `OAuthToken` model must exist before the OAuth callback can write to it; `Booking` model unique constraint must be designed before any booking logic
- Phase 3 before Phase 4: `/api/slots` must exist and be verified before the booking endpoint references `calendarService.getAvailableSlots`
- Phase 4 before Phase 5: UI hooks must call real endpoints, not mocks, to avoid contract drift
- Phase 6 last: Hardening is scoped to configuration changes; no feature work should happen alongside hardening

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Google Calendar Integration):** The OAuth2 consent flow for personal Google accounts has specific requirements (`access_type=offline`, `prompt=consent` on first auth) that are easy to misconfigure. The `googleapis` library version-specific API surface for Calendar v3 and OAuth2Client should be verified against current documentation before implementation.
- **Phase 5 (Booking UI):** `react-day-picker` v9 API details (specifically how to mark unavailable dates and integrate with the slot list) should be verified against current docs — v9 is a significant rewrite from v8.

Phases with standard patterns (skip research-phase):
- **Phase 1 (React + Tailwind Migration):** Well-documented migration pattern; Tailwind v4 Vite plugin integration is straightforward
- **Phase 2 (Database Schema):** Prisma schema design for these models is conventional; unique constraint syntax is stable
- **Phase 4 (Booking API):** Express + Zod + Prisma pattern is well-established; `express-rate-limit` middleware usage is straightforward
- **Phase 6 (Production Hardening):** Configuration-only changes; standard Express CORS and Resend domain verification

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Existing locked stack confirmed via codebase inspection; new library version numbers not live-verified due to tool unavailability; patterns are correct |
| Features | MEDIUM | Feature set well-reasoned from project constraints and domain knowledge; competitor comparison based on training data (Aug 2025 cutoff) |
| Architecture | HIGH | Google Calendar API v3 and OAuth2 web server flow are stable, well-documented patterns; codebase structure confirmed via direct inspection; component boundaries are sound |
| Pitfalls | HIGH | Most pitfalls drawn from direct codebase inspection (confirmed issues) or well-established Google API behavior; not speculative |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Tailwind v4 exact setup steps:** Confirm `@tailwindcss/vite` plugin integration against current Tailwind v4 docs before Phase 1 begins; v4 changed the setup model significantly from v3 and some tutorials are outdated
- **`react-day-picker` v9 API:** Confirm the API for marking days as unavailable and integrating the day selection with a separate time slot list before Phase 5 begins; v9 is a significant rewrite
- **Google Cloud Console setup:** The trainer must create a Google Cloud project, enable the Calendar API, and configure OAuth2 credentials (client ID, secret, authorized redirect URI) before Phase 3 can run; this is an operational prerequisite, not a code task — confirm it is done before Phase 3 starts
- **Resend domain verification:** The `from` sender domain must be verified in Resend before any real confirmation emails can be sent; this is a prerequisite for Phase 6 but should be initiated early (Resend domain verification can take time)
- **Timezone of trainer:** The trainer's local timezone must be stored as a configuration value (env var or DB config) so that server-side email rendering can display the correct local time in confirmation emails — clarify and document this before Phase 4

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` (direct inspection) — confirmed Prisma 7 generator config, existing models
- `package.json` (direct inspection) — confirmed all installed package versions
- `server/index.ts`, `server/controllers/contactController.ts`, `server/services/emailService.ts` (direct inspection) — confirmed server structure, existing patterns, confirmed security issues
- `.planning/codebase/CONCERNS.md` (direct inspection) — confirmed no rate limiting, wildcard CORS
- `.planning/codebase/INTEGRATIONS.md` (direct inspection) — confirmed Resend sandbox sender
- Google OAuth2 web server flow documentation (training knowledge) — stable, well-documented
- Google Calendar API v3 freebusy + events.insert documentation (training knowledge) — stable API

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 Vite plugin integration (training knowledge, Aug 2025 cutoff) — v4 was in active development; verify against current docs
- `react-day-picker` v9 API surface (training knowledge) — v9 is a significant rewrite; verify before Phase 5
- Competitor analysis: Acuity Scheduling, Calendly, Mindbody (training knowledge) — verify against current feature pages before making decisions that depend on competitive parity

### Tertiary (LOW confidence)
- Neon serverless connection pool limits (training knowledge) — Neon's connection limits vary by plan; verify current free-tier limits before assuming 100 connections

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
