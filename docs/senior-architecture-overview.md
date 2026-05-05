# JJM Fitness Booking Platform — Senior Architecture Overview

**Stack:** React 19 + TypeScript + Vite · Node.js + Express + TypeScript · PostgreSQL (Neon/Prisma) · Google Calendar API v3 · Resend  
**Pattern:** REST SPA → Express monolith → managed Postgres  
**Auth:** Session (OAuth state) + JWT (trainer API)  
**Automation:** `node-cron` (hourly) for reminders and review requests

---

## 1. Problem Domain

A solo personal trainer was managing scheduling via direct messages. The failure modes were predictable: double-bookings from lack of a shared source of truth, no confirmation paper trail, manual reminders, and no feedback loop after sessions. This system replaces that workflow with a booking platform that:

- Shows real-time slot availability derived from Google Calendar freebusy
- Accepts public bookings and immediately syncs them back to the trainer's calendar
- Sends confirmation, 24h reminder, and post-session review request emails automatically
- Gives the trainer a dashboard to cancel, reschedule, and moderate testimonials

The business constraint that shapes the entire design: **a solo trainer, one calendar, no multi-tenancy**. That constraint justifies several simplifications (credentials in env, no users table, OAuth tokens stored as a single row) that would be wrong at any other scale.

---

## 2. System Topology

```
Browser
  │
  │  HTTPS
  │
  ▼
React SPA (Vite, client/src/)
  - LandingPage          /
  - ReviewPage           /review
  - AdminLoginPage       /admin/login
  - AdminPage            /admin        ← protected (ProtectedRoute)
  │
  │  HTTP REST  (CORS: ALLOWED_ORIGIN only)
  │
  ▼
Express Server  (server/app.ts + server/index.ts)
  ├─ Middleware stack
  │    helmet → cors → json → session → apiLimiter → loginLimiter → routes
  │
  ├─ Route groups
  │    /api/contact        → contactController
  │    /api/slots          → slotController
  │    /api/bookings       → bookingController     (POST public, rest JWT-gated)
  │    /api/auth           → authController        (rate-limited: 5/15min)
  │    /api/testimonials   → testimonialController (POST public, rest JWT-gated)
  │    /auth/google        → calendarService (OAuth2 consent redirect)
  │    /auth/google/callback → calendarService (code exchange)
  │
  ├─ Services
  │    calendarService.ts  ← Google Calendar API v3
  │    emailService.ts     ← Resend SDK
  │    reminderService.ts  ← queries DB, calls emailService
  │    reviewRequestService.ts ← queries DB, calls emailService
  │
  └─ Cron (hourly, disabled in NODE_ENV=test)
       reminderService.run()
       reviewRequestService.run()
  │
  ▼
PostgreSQL (Neon)    Google Calendar API     Resend
  4 models             OAuth2 + freebusy       transactional email
```

**Key callout:** The Express server is the only system that writes to Postgres. The React client never touches the DB directly. External service calls (Google, Resend) are made server-side only, so credentials never touch the client.

---

## 3. Data Model

```sql
-- ContactSubmission
-- Simple lead capture. Never queried by the booking system.
id            Int       PK
name          String    max 100
email         String    max 254
phone         String?   max 20
goal          String?   max 500
message       String?   max 2000
createdAt     DateTime  default now()

-- OAuthToken
-- Always exactly one row (provider = 'google'). Upserted on each OAuth flow.
-- Tokens survive server restarts; auth state does not depend on memory.
id            Int       PK
provider      String    "google"
accessToken   String
refreshToken  String
expiresAt     DateTime
updatedAt     DateTime  updatedAt

-- Booking (core model)
id                   Int       PK
name                 String    max 100
email                String    max 254
phone                String?   max 20
message              String?   max 2000
slotTime             DateTime  @unique  ← the invariant
status               String    "confirmed" | "cancelled"  default "confirmed"
googleEventId        String?   set async after booking; null until then
reminderSentAt       DateTime? null = not sent; cron stamp = sent
reviewRequestSentAt  DateTime? null = not sent; cron stamp = sent
createdAt            DateTime  default now()

-- Testimonial
id        Int     PK
name      String  max 100
rating    Int     1–5
message   String  max 2000
approved  Boolean default false
createdAt DateTime default now()
```

### The Central Invariant

> **No two confirmed bookings may share a `slotTime`.**

This is enforced at the schema level with `@unique`. Every other constraint in the system is application logic and therefore fallible. This one is the database's guarantee. See §5 for how the application layer reinforces it.

### Indexes Added in Phase 7

Three compound indexes were added to prevent full-table scans in the hourly cron:

```sql
-- Used by reminderService: confirmed bookings in time window, not yet reminded
INDEX (status, slotTime, reminderSentAt)

-- Used by reviewRequestService: confirmed bookings past slotTime, not yet reviewed
INDEX (status, slotTime, reviewRequestSentAt)

-- Used by admin cancel/reschedule: lookup by client email
INDEX (email)
```

Without index 1 and 2, the hourly cron degrades to O(n) full scans as bookings accumulate.

---

## 4. Authentication Architecture

### Two Distinct Auth Contexts

**1. OAuth2 (Google Calendar) — server-to-server, one-time setup**

The trainer authorizes Google Calendar access once. From then on the app operates autonomously.

```
Trainer → GET /auth/google (requireJwt)
  Server generates: state = crypto.randomBytes(32).hex()
  Stores state in session (httpOnly cookie, 10min TTL)
  Redirects to Google consent screen with state param

Google → GET /auth/google/callback?code=X&state=Y
  Server validates: session.oauthState === Y  (CSRF guard)
  Exchanges code for { access_token, refresh_token, expiry_date }
  Upserts OAuthToken row in DB
  Returns JSON success
```

State goes into the session (not the URL) to prevent CSRF. An attacker forging a callback URL can't know the session value.

**2. JWT (Trainer Admin API) — per-request auth**

```
POST /api/auth/login
  Body: { email, password }
  Server: compare password to bcrypt hash from env
  Issues: jwt.sign({ role: 'trainer' }, JWT_SECRET, { expiresIn: '24h' })
  Client stores in localStorage

GET /api/bookings
  Header: Authorization: Bearer <token>
  Middleware: jwt.verify(token, JWT_SECRET)
  Calls next() or returns 401
```

The middleware (`requireJwt.ts`) fails closed: if `JWT_SECRET` is undefined at startup, every JWT call returns 503, not 200. This prevents a misconfigured deploy from silently exposing admin endpoints.

**Known issue:** `localStorage` is accessible to XSS payloads. The correct fix is `httpOnly` cookies with CSRF tokens — deferred due to complexity cost vs. current threat model (no third-party scripts on admin route).

---

## 5. Double-Booking Protection — Full Flow

This is the most important correctness property in the system. The sequence under concurrent requests:

```
Request A                          Request B
t=0  findUnique(slotTime) → null   
t=1                                findUnique(slotTime) → null  ← A hasn't written yet
t=2  prisma.create(slotTime)       
t=3  → INSERT succeeds             prisma.create(slotTime)
t=4                                → P2002: unique constraint violation
t=5  201 { id: 1, ... }            catch(P2002) → 409 "Time slot unavailable"
```

The application-level check at `t=0`/`t=1` handles the common case and returns a clean 409 before touching the DB. The `@unique` constraint catches the race condition at `t=4`. The P2002 catch block maps it to the same 409, so the user-facing response is identical either way.

**Why not a database transaction with `SELECT FOR UPDATE`?** It would work but adds lock contention under load and requires a transaction context across the check+insert. The two-layer approach is simpler and sufficient for the concurrency profile of a solo trainer's booking calendar.

---

## 6. Google Calendar Integration

### Slot Availability: `GET /api/slots?date=YYYY-MM-DD`

```
1. Parse date, validate it's not in the past and ≥48h from now
2. Define working hours for the requested day:
     Weekday → 18:00–22:00 (trainer timezone)
     Weekend → 16:00–20:00 (trainer timezone)
3. Generate 1-hour candidate slots within that window
4. Call Google Calendar freebusy API:
     POST https://www.googleapis.com/calendar/v3/freeBusy
     { timeMin, timeMax, items: [{ id: 'primary' }] }
5. Filter candidates against busy periods
6. Also filter against confirmed bookings in DB (belt-and-suspenders)
7. Return available slots as ISO8601 strings
```

The DB filter in step 6 is the safety net for the case where a calendar event was created but then something went wrong (e.g., the Google event was deleted manually but the booking still exists in the DB).

### Token Auto-Refresh

Every Google API call goes through `getAuthenticatedClient()`:

```typescript
const stored = await prisma.oAuthToken.findFirst();

// Proactive refresh: if token expires within 5 minutes, refresh now.
// Why 5 min? A token with 30s left can expire mid-request.
if (stored.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
  const { credentials } = await oauth2Client.refreshAccessToken();
  await prisma.oAuthToken.update({ data: { accessToken: ..., expiresAt: ... } });
}

oauth2Client.setCredentials(credentials);
return oauth2Client;
```

Tokens are persisted to Postgres after every refresh. If the server restarts between a refresh and the next use, the refreshed token is still there.

---

## 7. Booking Lifecycle

```
POST /api/bookings
  │
  ├─ Validate: name, email, slotTime required; slotTime ≥ now+48h
  ├─ Check: findUnique(slotTime) → 409 if taken
  │
  ├─ prisma.booking.create(...)          ← source of truth, must succeed
  │
  ├─ try { createCalendarEvent(booking) }  ← non-fatal
  │       → update booking.googleEventId
  │   catch { log error }                  ← booking still exists
  │
  └─ try { sendBookingConfirmation(booking)   ← non-fatal
           sendBookingNotification(booking) }
      catch { log error }

PATCH /api/bookings/:id/cancel (requireJwt)
  ├─ findUnique(id) → 404 if not found
  ├─ prisma.booking.update({ status: 'cancelled' })
  ├─ try { deleteCalendarEvent(googleEventId) }  ← non-fatal
  └─ try { sendCancellationNotification / sendClientCancellationEmail }  ← non-fatal

PATCH /api/bookings/:id/reschedule (requireJwt)
  ├─ findUnique(id) → 404 if not found
  ├─ Validate: new slotTime ≥ now+48h; different from current; not double-booked
  ├─ prisma.booking.update({
  │     slotTime: newSlotTime,
  │     reminderSentAt: null,       ← reset so cron sends a fresh reminder
  │     reviewRequestSentAt: null   ← reset so review request is resent post-new-session
  │  })
  ├─ try { deleteCalendarEvent(old) + createCalendarEvent(new) }  ← non-fatal
  └─ try { sendRescheduleConfirmation(...) }  ← non-fatal (not yet implemented)
```

**Non-fatal side effects** is a deliberate architectural choice: the booking record is the source of truth. Google Calendar and Resend are delivery mechanisms. If either is down, the booking is not rolled back. The trainer will see the booking in the dashboard and can handle communication manually if needed.

---

## 8. Automated Email Pipelines

### Reminder Service (cron: hourly)

```
Window: [now + 23h, now + 25h]  — 2-hour window catches any hourly drift

SELECT * FROM bookings
WHERE status = 'confirmed'
  AND slotTime >= windowStart
  AND slotTime <= windowEnd
  AND reminderSentAt IS NULL

→ For each result:
    sendBookingReminder(booking)
    UPDATE bookings SET reminderSentAt = now() WHERE id = booking.id
```

The `reminderSentAt IS NULL` predicate is the idempotency guard. If the cron fires twice (e.g., process restart at hour boundary), the second run finds 0 eligible rows. If `sendBookingReminder` throws, `reminderSentAt` is never stamped, so the cron will retry on the next run.

**What if the cron skips an hour?** The 2-hour window (23h–25h, not exactly 24h) provides tolerance for up to ~60 minutes of cron delay before a reminder falls outside the window.

### Review Request Service (cron: hourly)

```
Window: [now - 7d, now - 1h]  — only after slotTime has passed

SELECT * FROM bookings
WHERE status = 'confirmed'
  AND slotTime <= windowEnd      ← session already happened
  AND slotTime >= windowStart    ← within 7-day request window
  AND reviewRequestSentAt IS NULL

→ For each result:
    sendReviewRequest(booking)
    UPDATE bookings SET reviewRequestSentAt = now() WHERE id = booking.id
```

The 7-day upper bound prevents review requests for very old sessions (e.g., if the cron was down for a week).

---

## 9. Email Service Design

All outbound email goes through Resend. `emailService.ts` exposes one function per email type:

| Function | Recipients | Trigger |
|---|---|---|
| `sendBookingConfirmation` | client | new booking |
| `sendBookingNotification` | trainer | new booking |
| `sendBookingReminder` | client | 24h before slotTime |
| `sendReviewRequest` | client | post-session |
| `sendCancellationNotification` | trainer | booking cancelled |
| `sendClientCancellationEmail` | client | booking cancelled |
| `sendContactAlert` | trainer | contact form submitted |

**Security:** All user-supplied fields (name, message, etc.) pass through `escapeHtml()` before insertion into HTML templates. This prevents XSS if a malicious name like `<img src=x onerror=...>` is submitted.

**Timezone:** Slot times are formatted using the `TRAINER_TIMEZONE` env var (e.g., `Asia/Taipei`) so the trainer and client see local times, not UTC.

---

## 10. Frontend Architecture

### Route Structure

```
/                  LandingPage    (public)
/review            ReviewPage     (public, accepts booking token in query param)
/admin/login       AdminLoginPage (public)
/admin             AdminPage      (protected — ProtectedRoute)
```

`ProtectedRoute` checks `localStorage` for a JWT and validates its expiry client-side before rendering. If invalid, it redirects to `/admin/login`. This is a UX guard, not a security boundary — the API validates the JWT on every request regardless.

### Booking Modal — 4-Step Wizard

```
Step 1: Date Selection
  Calendar built from scratch (no lib dependency)
  Minimum: today + 2 calendar days
  Disabled: past dates, Sundays (business rule)

Step 2: Time Slot Selection
  GET /api/slots?date=YYYY-MM-DD
  Renders available 1-hour slots
  Error state handles network failure or no available slots

Step 3: Client Details Form
  Fields: name*, email*, phone?, message?
  Client-side validation before submission

Step 4: Success Confirmation
  Renders booked time + confirmation note
  Returns to landing on close
```

### Admin Dashboard (AdminPage)

Two tabs:
- **Bookings** — table of all bookings, status badge, cancel button, reschedule panel
- **Testimonials** — list with approve/pending status, approve action for pending items

`ReschedulePanel` is a controlled component: it fetches available slots for the selected date and submits `PATCH /api/bookings/:id/reschedule`. The parent (AdminPage) re-fetches all bookings on success to keep state consistent.

### State Management

No external state library. Component-local `useState` + `useEffect` for data fetching. Auth state is derived by reading `localStorage` on mount (via `auth.ts` helpers). Modals are controlled with `isOpen` booleans lifted to the nearest shared parent.

---

## 11. Security Posture

| Threat | Layer | Mitigation |
|---|---|---|
| XSS → stolen JWT | Client | `httpOnly` cookie (future); current: localStorage with known risk |
| XSS in email | Server | `escapeHtml()` on all user input before template insertion |
| CSRF on OAuth callback | Server | Random `state` in session; validated on callback |
| Brute force on login | Server | 5 req / 15 min per IP on `/api/auth` |
| API abuse / scraping | Server | 20 req / 15 min per IP on all `/api/*` |
| Admin route exposure | Server | `requireJwt` middleware; fails closed (503) if `JWT_SECRET` unset |
| Double-booking | DB + Server | `@unique` constraint + P2002 catch; API-level pre-check |
| OAuth token leak | Server | Tokens in DB only; never sent to client; refresh in-place |
| Missing env vars | Server | `index.ts` validates `REQUIRED_ENV_VARS` on startup; process exits if any missing |
| Overly permissive CORS | Server | `ALLOWED_ORIGIN` env var; not `*` |
| Clickjacking | Server | `helmet()` sets `X-Frame-Options: SAMEORIGIN` |

---

## 12. Testing Strategy

**Framework:** Vitest + Supertest  
**Test entry:** `server/__tests__/`  
**Isolation:** `NODE_ENV=test` disables cron and rate limiting

**What's covered:**

| Area | Approach |
|---|---|
| Booking controller | Supertest HTTP requests; validates 201, 400, 409 paths |
| Double-booking | Creates a booking then attempts the same slot; expects 409 |
| JWT middleware | Requests with missing / invalid / expired tokens |
| Contact form | Validates required fields, max lengths |
| Email service | Mocked Resend client; asserts correct recipient + subject |
| Reminder service | Seeds DB with bookings at correct window offsets; asserts stamp |
| Review request service | Same pattern as reminder |
| Rate limiting | Skipped in test env via `NODE_ENV` check |

**Gap:** Concurrent booking race condition is not tested with parallel requests. The `@unique` constraint handles it, but there's no explicit integration test that fires two simultaneous POSTs to prove it. A future test would use `Promise.all([createBooking(slot), createBooking(slot)])` and assert exactly one 201 and one 409.

---

## 13. `app.ts` / `index.ts` Separation

```
server/index.ts                   server/app.ts
───────────────                   ─────────────
Env validation                    Middleware stack (helmet, cors, etc.)
app.listen(PORT)                  Route mounts
cron.schedule(hourly)             Exports: app (no listen call)
Global unhandledRejection handler
```

Test files `import app from '../app'` and pass it to `supertest(app)`. No port is opened, no cron starts. This is standard Express testing practice and why the split matters — it's not cosmetic.

---

## 14. Environment Variables

```bash
# Database
DATABASE_URL            # Neon PostgreSQL connection string

# Server
PORT                    # Express listen port (default 3001)
ALLOWED_ORIGIN          # Frontend URL for CORS allow-list

# Session
SESSION_SECRET          # 64-byte hex; used for OAuth state cookie

# Trainer credentials (env-stored; no users table)
ADMIN_EMAIL             # Trainer login email
ADMIN_PASSWORD_HASH     # bcrypt hash of trainer password

# JWT
JWT_SECRET              # 64-byte hex; signs trainer JWTs

# Email (Resend)
RESEND_API              # Resend API key
TRAINER_EMAIL           # Destination for trainer notifications
RESEND_FROM_EMAIL       # Sender address (override Resend sandbox default)
TRAINER_TIMEZONE        # IANA timezone string (e.g., "Asia/Taipei")

# Google OAuth
OAUTH_CLIENT            # Google OAuth2 client ID
OAUTH_SECRET            # Google OAuth2 client secret
OAUTH_REDIRECT_URI      # Callback URL (must match Google Cloud Console)
```

All 13 vars are validated at startup. The server refuses to start if any are missing.

---

## 15. Known Limitations and Future Work

**P1 — JWT in localStorage**  
Move to `httpOnly` `SameSite=Strict` cookie + CSRF token. Current approach is acceptable for a low-traffic admin-only route but is technically XSS-vulnerable.

**P2 — Single trainer, env-based credentials**  
No user table, no registration. This is a constraint, not an oversight — the system is intentionally scoped to one trainer. Multi-trainer support would require a `User` model, bcrypt in DB, and scoped calendar tokens.

**P3 — No concurrency test for race condition**  
The `@unique` constraint is the correct defense. A `Promise.all` integration test would make that guarantee explicit and prevent future regressions from accidentally removing the constraint.

**P4 — Cron runs in-process**  
`node-cron` fires inside the Express process. If the server is under load, cron runs can be delayed. For higher volume: move cron to a separate worker process or use a managed job scheduler (e.g., Vercel Cron, pg_cron).

**P5 — No retry logic on email failures**  
If Resend's API returns a 5xx, the stamp is never set and the cron will retry on the next run — which is actually correct behavior for reminders. However, for booking confirmation emails (triggered once, no retry), a failure is silent. A dead-letter pattern or webhook from Resend would close this gap.

---

## 16. Build and Deployment

```bash
# Install
npm install           # root (shared dev deps)
cd client && npm install
cd ../server && npm install

# Dev
npm run dev           # starts both Vite (client) and tsx (server) via concurrently

# Build
cd client && npm run build   # Vite → client/dist
cd server && npm run build   # tsc → server/dist

# Database
npx prisma migrate deploy    # apply pending migrations (production)
npx prisma migrate dev       # apply + create migration (development)

# Tests
cd server && npm test
```

**Pending migration:** `add_indexes` migration (adds the three compound indexes) should be run before the next deploy to production. See `prisma/migrations/` for the SQL.
