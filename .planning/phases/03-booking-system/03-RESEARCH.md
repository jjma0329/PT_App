# Phase 3: Booking System — Research

**Researched:** 2026-03-25
**Domain:** Express booking API, Prisma schema design, Google Calendar event creation, Resend email, React modal integration, rate limiting
**Confidence:** HIGH

---

## Summary

Phase 3 assembles a complete end-to-end booking flow on top of existing infrastructure. The frontend (`BookingModal.tsx`) is already built and wired — it POSTs `{ name, email, phone, message, slotTime }` to `/api/bookings`. The backend has no bookings route, no Booking model in Prisma, and the OAuth scope is `calendar.readonly` (must be upgraded to allow event creation). Everything else — Prisma singleton, Resend, Express route/controller/service pattern — is established and working.

The most architecturally critical decisions are: (1) the double-booking protection strategy at the DB layer (unique constraint + re-verify on every submit), (2) the write ordering pattern (DB first, Calendar second, email last — so a Calendar failure doesn't leave an orphan booking), and (3) the OAuth scope upgrade, which requires the trainer to re-authorize once before Phase 3 can function end-to-end.

**Primary recommendation:** Add a `Booking` model with `@@unique([slotTime])`, create the `POST /api/bookings` controller following the contactController pattern exactly, add a `createCalendarEvent` function to calendarService.ts, add two new email functions to emailService.ts, and apply `express-rate-limit` to all API routes in `server/index.ts`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-04 | Rate limiting applied to all API endpoints | `express-rate-limit` not installed; must be added; applied in `server/index.ts` before all route mounts |
| CAL-05 | Confirmed bookings automatically create events in trainer's Google Calendar | Requires OAuth scope change from `calendar.readonly` to `https://www.googleapis.com/auth/calendar.events`; trainer must re-authorize; `calendar.events.insert()` API documented below |
| BOOK-01 | Visitor can browse available dates on a calendar picker | Already implemented in `BookingModal.tsx` step 1 — no backend work needed |
| BOOK-02 | Visitor can select a specific time slot shown as exact times | Already implemented in `BookingModal.tsx` step 2 — slots rendered from `/api/slots` |
| BOOK-03 | Visitor can submit a booking form (name, email, phone, message) | Already implemented in `BookingModal.tsx` step 3 — POSTs to `/api/bookings`; needs the endpoint to exist |
| BOOK-04 | System prevents double-booking (unique DB constraint + conflict re-check before write) | `@@unique([slotTime])` on Booking model + server-side re-verify of slot availability before insert |
| BOOK-05 | Visitor receives booking confirmation email via Resend | New `sendVisitorConfirmation` function in `emailService.ts` following existing `escapeHtml` + `safeField` pattern |
| BOOK-06 | Trainer receives booking notification email via Resend | New `sendTrainerNotification` function in `emailService.ts` — parallel to existing `sendContactAlert` |
| BOOK-07 | Booking record saved to database (Prisma Booking model) | New `Booking` model in `schema.prisma`; migration required |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new dependencies except rate limiter)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express 5 | ^5.2.1 | HTTP route handler | Already in use |
| Prisma 7 | ^7.4.2 | DB ORM + migration | Already in use with singleton |
| googleapis | ^171.4.0 | Google Calendar events API | Already in use for freebusy |
| resend | ^6.9.3 | Transactional email | Already in use for contact alerts |
| TypeScript | ~5.9.3 | Type safety | Project-wide |

### New Dependency Required

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| express-rate-limit | ^7.x | Per-IP request throttling | SEC-04; not installed; standard Express rate limiter |

**Installation:**
```bash
npm install express-rate-limit
npm install --save-dev @types/express-rate-limit
```

Note: `express-rate-limit` v7+ ships its own types; the `@types/` package is only needed if the version bundled types are incomplete. Verify after install.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| express-rate-limit | rate-limiter-flexible | More features (Redis-backed), more complexity — overkill for a single-server v1 app |
| express-rate-limit | upstash/ratelimit | Requires Redis/Upstash account — adds infra dependency |
| Prisma unique constraint | application-level lock | DB constraint is the only reliable guarantee; app locks are bypassed by concurrent processes |

---

## Architecture Patterns

### Booking Write Order (Critical)

The order of operations inside the booking controller must be:

1. **Validate inputs** (name, email, slotTime present and well-formed)
2. **Re-verify slot availability** against Google Calendar (`getAvailableSlots` for that date)
3. **Insert Booking row** (Prisma `create` — unique constraint fires here if race condition)
4. **Create Google Calendar event** (using new `createCalendarEvent` in calendarService.ts)
5. **Send visitor confirmation email** (non-fatal — catch and log, do not return 500)
6. **Send trainer notification email** (non-fatal — catch and log)
7. **Return 201 success**

If step 3 fails with `P2002` (unique constraint violation), return 409 with a clear "slot already booked" message — the frontend `BookingModal.tsx` already reads `json.error` and displays it.

If step 4 fails (Calendar API error), the booking is saved. Log the error. Do not roll back the DB row — this is acceptable for v1. The trainer can see the booking email and add the Calendar event manually if needed.

### Recommended New File Structure

```
server/
├── routes/
│   ├── contact.ts         (existing)
│   ├── slots.ts           (existing)
│   ├── auth.ts            (existing)
│   └── bookings.ts        (NEW — mirrors slots.ts structure)
├── controllers/
│   ├── contactController.ts   (existing)
│   ├── slotsController.ts     (existing)
│   ├── authController.ts      (existing)
│   └── bookingsController.ts  (NEW — mirrors contactController.ts structure)
├── services/
│   ├── calendarService.ts     (existing — ADD createCalendarEvent function)
│   └── emailService.ts        (existing — ADD 2 new email functions)
├── lib/
│   └── prisma.ts              (existing singleton — no changes)
└── index.ts                   (existing — ADD rate limiter + bookings route mount)
```

### Pattern 1: Controller shape (follow contactController.ts exactly)

```typescript
// server/controllers/bookingsController.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { getAvailableSlots, createCalendarEvent } from '../services/calendarService.ts';
import { sendVisitorConfirmation, sendTrainerNotification } from '../services/emailService.ts';

export async function createBooking(req: Request, res: Response): Promise<void> {
  // 1. Destructure and validate inputs (early return pattern)
  const { name, email, phone, message, slotTime } = req.body as { ... };
  if (!name || !email || !slotTime) {
    res.status(400).json({ success: false, error: 'name, email, and slotTime are required.' });
    return;
  }

  // 2. Re-verify slot is still available (prevents stale-UI bookings)
  const dateStr = slotTime.slice(0, 10); // ISO string → YYYY-MM-DD
  const availableSlots = await getAvailableSlots(dateStr);
  if (!availableSlots.includes(slotTime)) {
    res.status(409).json({ success: false, error: 'This time slot is no longer available.' });
    return;
  }

  try {
    // 3. Write booking to DB — unique constraint fires here on race condition
    const booking = await prisma.booking.create({
      data: { name, email, phone: phone || null, message: message || null, slotTime: new Date(slotTime) },
    });

    // 4. Create Google Calendar event (failure is non-fatal)
    try {
      await createCalendarEvent({ name, email, slotTime: booking.slotTime });
    } catch {
      // log in production; do not fail the booking
    }

    // 5+6. Send emails (non-fatal)
    try {
      await sendVisitorConfirmation({ name, email, slotTime: booking.slotTime });
    } catch { /* non-fatal */ }
    try {
      await sendTrainerNotification({ name, email, phone, message, slotTime: booking.slotTime });
    } catch { /* non-fatal */ }

    res.status(201).json({ success: true, data: booking });
  } catch (err: unknown) {
    // P2002 = Prisma unique constraint violation
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
      res.status(409).json({ success: false, error: 'This time slot was just booked. Please choose another.' });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to save booking.' });
  }
}
```

### Pattern 2: Prisma Booking model

```prisma
model Booking {
  id        Int      @id @default(autoincrement())
  name      String
  email     String
  phone     String?
  message   String?
  slotTime  DateTime @unique  // prevents double-booking at DB layer
  createdAt DateTime @default(now())
}
```

The `@unique` on `slotTime` is the hard DB-layer lock. If two requests race past the API-layer check, only one INSERT succeeds — the other gets Prisma error code `P2002`.

### Pattern 3: Google Calendar event creation

The existing `calendarService.ts` scope is `calendar.readonly`. For event creation, the scope must change to `https://www.googleapis.com/auth/calendar.events` (write-only events) or the full `https://www.googleapis.com/auth/calendar` scope.

The trainer must re-authorize once after this change. The `saveTokensFromCode` and `getAuthenticatedClient` functions are unchanged — only the scope in `getAuthUrl` changes.

```typescript
// ADD to calendarService.ts — new exported function
export async function createCalendarEvent(details: {
  name: string;
  email: string;
  slotTime: Date;
}): Promise<void> {
  const timezone = process.env.TRAINER_TIMEZONE ?? 'UTC';
  const authClient = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const startTime = details.slotTime.toISOString();
  const endTime = new Date(details.slotTime.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour

  await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `PT Session — ${details.name}`,
      description: `Booked by: ${details.name}\nEmail: ${details.email}`,
      start: { dateTime: startTime, timeZone: timezone },
      end: { dateTime: endTime, timeZone: timezone },
    },
  });
}
```

Source: googleapis library `calendar.events.insert()` — stable v3 API.

### Pattern 4: Rate limiting in server/index.ts

```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                    // general API calls per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                      // 5 booking attempts per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many booking attempts. Please try again later.' },
});

// Apply general limiter before all routes
app.use('/api', apiLimiter);

// Apply strict limiter specifically to booking endpoint
app.use('/api/bookings', bookingLimiter);
```

SEC-04 requires rate limiting on ALL API endpoints. The cleanest implementation is a single `app.use('/api', apiLimiter)` before route mounts, plus a tighter `bookingLimiter` on `/api/bookings` specifically.

### Pattern 5: Email functions (follow existing emailService.ts exactly)

The existing `escapeHtml` and `safeField` utilities are already defined in `emailService.ts`. New functions import and reuse them — no new escaping logic needed.

New interfaces to add:
```typescript
interface BookingDetails {
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  slotTime: Date;
}
```

Two new exported async functions following `sendContactAlert` pattern:
- `sendVisitorConfirmation(booking: BookingDetails)` — to `booking.email`
- `sendTrainerNotification(booking: BookingDetails)` — to `process.env.TRAINER_EMAIL!`

Both format `slotTime` for email display using:
```typescript
const formattedTime = booking.slotTime.toLocaleString('en-US', {
  timeZone: process.env.TRAINER_TIMEZONE ?? 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
```

### Pattern 6: Route registration in server/index.ts

```typescript
import bookingsRouter from './routes/bookings.js';
// ...
app.use('/api/bookings', bookingLimiter);  // tighter limiter first
app.use('/api/bookings', bookingsRouter);
```

### Pattern 7: App.tsx wiring for BookingModal

`BookingModal.tsx` exists but is NOT rendered in `App.tsx`. Currently `App.tsx` renders `ContactModal`, not `BookingModal`. The planner must include a task to wire `BookingModal` into `App.tsx` — either replacing `ContactModal` or adding it as a second modal depending on what the "Book a Session" CTA buttons open.

Looking at `App.tsx`: the `openModal` callback is passed to `Header`, `HeroSection`, `AboutSection`, and `PlansSection`. Currently it opens `ContactModal`. Phase 3 should swap this to open `BookingModal` instead (the CTA goal is booking, not generic contact).

### Anti-Patterns to Avoid

- **Re-querying availability from the frontend on every step**: The `BookingModal.tsx` already fetches slots once per date selection — don't add a second fetch on the form step. The server-side re-verify at submit time is sufficient.
- **Rolling back the DB row if Calendar fails**: For v1, a saved booking with a failed Calendar sync is better than a failed booking. Keep the DB write as the authoritative source of truth.
- **Separate PrismaClient in bookingsController**: The singleton in `server/lib/prisma.ts` is already established — import from there.
- **Trusting `slotTime` from client without re-checking**: The client sends an ISO string it received from `/api/slots`. Still re-verify server-side — the slot could have been taken in the time since the visitor loaded it.
- **Putting `express-rate-limit` only on `/api/bookings`**: SEC-04 says ALL API endpoints. Apply a general limiter to `/api` as a parent prefix, then layer the stricter booking limiter on top.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom IP counter with in-memory Map | `express-rate-limit` | Handles window sliding, TTL cleanup, header standards (RateLimit-*), Edge cases |
| HTML escaping in emails | Custom regex replace | `escapeHtml` already in emailService.ts | Already written and tested in the project |
| OAuth token refresh | Custom refresh logic | `getAuthenticatedClient()` already in calendarService.ts | Already handles expiry check + DB update |
| DB unique enforcement | Application-level slot lock | Prisma `@unique` + catch `P2002` | DB constraint is the only race-condition-safe lock |
| ISO date formatting | Custom date serializer | `Date.toISOString()` + `toLocaleString()` | Standard; timezone-aware when given `timeZone` option |

**Key insight:** The hardest parts of this phase (OAuth, email sending, Prisma singleton, slot fetching) are already implemented. This phase is mostly assembly: one new Prisma model, one new controller, two new service functions, one new route, and wiring in rate limiting.

---

## Common Pitfalls

### Pitfall 1: OAuth scope is read-only — event creation will silently fail or return 403

**What goes wrong:** `getAuthUrl` in `calendarService.ts` uses `calendar.readonly` scope. Calling `calendar.events.insert()` with a read-only token returns a 403 from Google. The booking saves to DB but no Calendar event is created.

**Why it happens:** The scope was correct for Phase 2 (freebusy reads only). Phase 3 needs write access.

**How to avoid:** Update the scope in `getAuthUrl` to `https://www.googleapis.com/auth/calendar.events` before any Calendar write code is written. Then the trainer re-authorizes once via `/auth/google`. The existing `saveTokensFromCode` and `getAuthenticatedClient` functions are unchanged.

**Warning signs:** 403 errors in the Calendar event creation try/catch. Booking saves but Calendar stays empty.

### Pitfall 2: Double-booking race condition

**What goes wrong:** Two visitors submit at the same millisecond for the same slot. Both pass the API-layer re-verify (both see the slot as available). Both reach the Prisma `create` call. Without a DB unique constraint, both succeed — trainer is double-booked.

**Why it happens:** Read-then-write without atomic guarantee. Documented in existing PITFALLS.md.

**How to avoid:** `slotTime DateTime @unique` in the Booking model is mandatory. Catch `P2002` in the controller and return 409.

**Warning signs:** No `@unique` on `slotTime`. No P2002 error handling. Test: use `Promise.all` to fire two simultaneous identical POST requests — only one should succeed.

### Pitfall 3: `BookingModal.tsx` is not wired in App.tsx

**What goes wrong:** The entire frontend flow exists in `BookingModal.tsx` but `App.tsx` renders `ContactModal`, not `BookingModal`. The "Book a Session" buttons open the contact form, not the booking flow.

**How to avoid:** The planner must include an explicit task to replace `ContactModal` with `BookingModal` in `App.tsx`, or add `BookingModal` as a second modal and update the `onOpenModal` callbacks.

### Pitfall 4: Timezone mismatch in email formatting

**What goes wrong:** `new Date(slotTime).toLocaleString()` on the server uses the server's system timezone (likely UTC on a cloud host), not the trainer's local timezone. The email shows the wrong local time.

**How to avoid:** Always pass `timeZone: process.env.TRAINER_TIMEZONE ?? 'UTC'` to `toLocaleString`. STATE.md already flags that `TRAINER_TIMEZONE` must be set in `.env` before Phase 3 runs.

### Pitfall 5: Email failure returns 500 to visitor

**What goes wrong:** The booking saves. Resend returns an error (bad API key, domain not verified, rate limit). The controller throws. Visitor sees a generic error and retries — creating a duplicate booking attempt.

**How to avoid:** Wrap email calls in their own try/catch. Non-fatal. Return 201 success to the visitor even if email fails. The booking is saved; that's the source of truth.

### Pitfall 6: `slotTime` type mismatch

**What goes wrong:** The frontend sends `slotTime` as an ISO string (e.g. `"2026-04-01T18:00:00.000Z"`). The Prisma `DateTime` field expects a `Date` object on the TypeScript side. If the controller passes the raw string, Prisma may reject it or store it incorrectly depending on the version.

**How to avoid:** Always convert: `new Date(slotTime)` before passing to `prisma.booking.create()`. Validate the string is a parseable date before this.

### Pitfall 7: Re-authorization requirement not communicated to trainer

**What goes wrong:** The OAuth scope change requires the trainer to visit `/auth/google` again. If not communicated, the calendar integration will 403 silently.

**How to avoid:** The plan should include an explicit step: after deploying the scope change, trainer visits `/auth/google` once to re-authorize before testing end-to-end.

---

## Code Examples

### Prisma migration after adding Booking model

```bash
npx prisma migrate dev --name add-booking-model
```

This generates a migration file and applies it to the database. The `postinstall` script already runs `prisma generate`, so the client will regenerate on next `npm install`.

### Checking Prisma error code for unique violation

```typescript
import { Prisma } from '../../src/generated/prisma/client.ts';

// In catch block:
if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
  res.status(409).json({ success: false, error: 'Slot already booked.' });
  return;
}
```

Note: The import path for `Prisma` namespace follows the project's custom output path in `schema.prisma`: `output = "../src/generated/prisma"`. Adjust if the generated path differs.

### Re-verifying slot availability server-side

```typescript
const dateStr = slotTime.slice(0, 10); // "2026-04-01T18:00:00.000Z" → "2026-04-01"
const available = await getAvailableSlots(dateStr);
if (!available.includes(slotTime)) {
  res.status(409).json({ success: false, error: 'This time slot is no longer available.' });
  return;
}
```

`getAvailableSlots` returns ISO strings, and the client sends the same ISO string it received — direct array include check works. Edge case: normalize both to a consistent format before comparing if there's any clock skew concern.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Per-request PrismaClient | Singleton in `server/lib/prisma.ts` | Already done in this project |
| OAuth scope: `calendar.readonly` | Must change to `calendar.events` for Phase 3 | Trainer re-auth required once |
| No rate limiting | `express-rate-limit` v7 (simple, maintained) | SEC-04 addressed |
| `express-rate-limit` v6 and earlier | v7 changed API slightly — `onLimitReached` removed, `handler` preferred | Verify current v7 API when implementing |

**Deprecated/outdated:**
- `express-rate-limit` pre-v6: used `headers: true` option — replaced by `standardHeaders` and `legacyHeaders` in v6+.

---

## Open Questions

1. **Should `ContactModal` be replaced by `BookingModal` or kept alongside it?**
   - What we know: `App.tsx` renders `ContactModal`; `BookingModal.tsx` is built but unwired; all CTA buttons call `openModal` which currently opens `ContactModal`.
   - What's unclear: Whether the trainer wants a separate "Contact" form to remain (for non-booking inquiries) vs. a single booking entry point.
   - Recommendation: Replace `ContactModal` with `BookingModal` in the CTA flow for Phase 3 (goal is booking). The contact form is still reachable via its own route or can be linked separately. This is a product decision — flag for user confirmation.

2. **Does the Resend sender domain need to be verified before Phase 3 can be tested end-to-end?**
   - What we know: STATE.md flags this as a pre-Phase-3 concern. Current `from` is `onboarding@resend.dev` (test sender only).
   - What's unclear: Whether the domain verification is complete.
   - Recommendation: The plan should include a verification step early — if Resend domain is not verified, email tests will silently fail (Resend only delivers from `onboarding@resend.dev` to the account owner's verified address).

3. **What is the `TRAINER_TIMEZONE` env var set to?**
   - What we know: `calendarService.ts` already reads `process.env.TRAINER_TIMEZONE ?? 'UTC'`. STATE.md flags this as needed before Phase 3.
   - What's unclear: Whether it has been set in `.env`.
   - Recommendation: The plan's first task should verify `.env` has `TRAINER_TIMEZONE` set (e.g., `America/New_York`).

---

## Validation Architecture

There is no test framework installed in this project (confirmed in `CONCERNS.md` — "Zero Test Coverage"). Setting up a test framework is out of scope for Phase 3 itself, but the following manual and smoke-test strategies should be documented as verification steps in each plan.

### Manual Verification Map

| Req ID | Behavior | Verification Method |
|--------|----------|---------------------|
| SEC-04 | Rate limiting fires after threshold | `curl` loop: `for i in {1..10}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/bookings; done` — expect 429 after limit |
| CAL-05 | Calendar event created on booking | Submit a booking, check trainer's Google Calendar for new event at correct time |
| BOOK-01 | Calendar picker renders months | Open BookingModal, navigate months, verify past dates are disabled |
| BOOK-02 | Slots load for selected date | Select a date, verify slot grid loads from `/api/slots?date=YYYY-MM-DD` |
| BOOK-03 | Form submits with all fields | Fill all fields, submit, verify 201 response in network tab |
| BOOK-04 | Double-booking rejected | Submit same slot twice in two browser tabs at the same time — second should get a 409 |
| BOOK-05 | Visitor confirmation email received | Submit booking, check the email address used — expect subject "Booking Confirmed" |
| BOOK-06 | Trainer notification email received | Submit booking, check `TRAINER_EMAIL` inbox — expect booking details |
| BOOK-07 | Booking row in DB | `psql` or Prisma Studio: `SELECT * FROM "Booking" ORDER BY "createdAt" DESC LIMIT 1;` |

### Smoke Test Commands (no framework required)

```bash
# Start server
npm run server

# Test: POST a valid booking
curl -s -X POST http://localhost:3001/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","slotTime":"2026-04-10T18:00:00.000Z"}' | jq .

# Expected: { "success": true, "data": { "id": 1, ... } }

# Test: POST the same slot again
curl -s -X POST http://localhost:3001/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"name":"Other User","email":"other@example.com","slotTime":"2026-04-10T18:00:00.000Z"}' | jq .

# Expected: { "success": false, "error": "Slot already booked." } with HTTP 409

# Test: POST with missing required fields
curl -s -X POST http://localhost:3001/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"name":"Missing Email"}' | jq .

# Expected: { "success": false, "error": "name, email, and slotTime are required." } with HTTP 400
```

### Wave 0 Gaps

- [ ] No test framework installed — Vitest would be the natural fit (already uses Vite), but adding it is out of scope for Phase 3. Manual smoke tests above cover the critical paths.
- [ ] No shared fixture for a test DB — if Vitest is added in a future phase, a test database URL and seed script will be needed.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `server/services/calendarService.ts`, `server/services/emailService.ts`, `server/controllers/contactController.ts`, `server/controllers/slotsController.ts`, `server/index.ts`, `server/lib/prisma.ts`, `prisma/schema.prisma`, `src/components/BookingModal.tsx`, `src/App.tsx` — 2026-03-25
- `.planning/codebase/CONCERNS.md` — confirmed zero test coverage, no rate limiting
- `.planning/research/PITFALLS.md` — confirmed double-booking, rate limit, timezone, and OAuth scope pitfalls
- `package.json` — confirmed `express-rate-limit` is not installed; all other dependencies verified present

### Secondary (MEDIUM confidence)
- Google Calendar API v3 `events.insert` — stable documented endpoint; scope `calendar.events` requirement is well-documented behavior
- `express-rate-limit` v7 API — standardized headers behavior; verify `standardHeaders`/`legacyHeaders` options against installed version
- Prisma error code `P2002` for unique constraint violations — documented in Prisma error reference

### Tertiary (LOW confidence — verify when implementing)
- `express-rate-limit` `@types/` package necessity in v7 — types may be bundled; check after install

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries directly inspected in package.json and source files
- Architecture patterns: HIGH — patterns derived from existing working controllers in the same codebase
- Pitfalls: HIGH — most come from existing PITFALLS.md and confirmed code inspection; OAuth scope issue is directly observable in calendarService.ts
- Validation: MEDIUM — no test framework exists; manual steps are correct but not automated

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable stack; googleapis and Prisma API surfaces are stable)
