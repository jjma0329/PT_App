# Code Walkthrough — Phase 3: Booking System

**Audience:** Someone who knows Python well and is learning TypeScript/React at a beginner–intermediate level.

---

## What Phase 3 Built

The complete end-to-end booking experience:
- A 4-step UI wizard (date → time → form → confirmation)
- A backend endpoint that saves the booking as **pending**, sends a "request received" email to the client, and notifies the trainer
- A trainer confirm action that moves the booking to **confirmed**, creates the Google Calendar event, and sends the client their confirmation email
- Two-layer double-booking protection
- Rate limiting on all API routes

---

## Topology

```
Browser
└── src/pages/LandingPage.tsx
    └── BookingModal.tsx          ← 4-step wizard (date → time → form → success)
        │
        │  Step 2: GET /api/slots?date=YYYY-MM-DD
        │          (covered in Phase 2 walkthrough)
        │
        │  Step 3: POST /api/bookings
        │          body: { name, email, phone?, message?, slotTime }
        ▼
Express Server (server/app.ts)
├── Rate limiter ──────────────── applied to all /api/* routes (SEC-04)
└── /api/bookings → server/routes/bookings.ts
                        └── server/controllers/bookingController.ts
                                │
                                │ POST /api/bookings (public)
                                │ 1. Validate: name, email, slotTime required
                                │ 2. Check: is slot already booked? (API-level)
                                │ 3. Save:   prisma.booking.create() → status: "pending"
                                │               └── PostgreSQL (Booking table)
                                │               └── @unique on slotTime = DB-level guard
                                │ 4. (non-fatal) Send emails
                                │       └── server/services/emailService.ts
                                │               ├── sendBookingRequestReceived() → visitor
                                │               └── sendBookingNotification() → trainer
                                │
                                │ PATCH /api/bookings/:id/confirm (requireJwt)
                                │ 1. Set status: "confirmed"
                                │ 2. (non-fatal) Create Google Calendar event
                                │       └── server/services/calendarService.ts
                                │               └── createCalendarEvent()
                                │                       └── Google Calendar API
                                │ 3. (non-fatal) sendBookingConfirmation() → visitor
                                │
                                │ PATCH /api/bookings/:id/cancel (requireJwt)
                                │ PATCH /api/bookings/:id/reschedule (requireJwt)
                                │ GET   /api/bookings              (requireJwt)
                                │       └── server/middleware/requireJwt.ts
                                │
                                └── respond: { success: true, data: booking }
```

---

## Files Changed in Phase 3

| File | What changed |
|------|-------------|
| `prisma/schema.prisma` | Added `Booking` model with `@unique` on `slotTime`; `googleEventId String?` for cancellation |
| `server/routes/bookings.ts` | New file — GET, POST, PATCH /:id/cancel, PATCH /:id/reschedule, PATCH /:id/confirm |
| `server/controllers/bookingController.ts` | `createBooking`, `getBookings`, `cancelBooking`, `rescheduleBooking`, `confirmBooking` |
| `server/middleware/requireJwt.ts` | New file — JWT guard for trainer-only routes |
| `server/app.ts` | New file — Express app, middleware, and all route mounts (split from `index.ts`) |
| `server/index.ts` | Now only: start server + run hourly cron jobs for reminders and review requests |
| `server/services/calendarService.ts` | Added `createCalendarEvent()` (returns event ID), `deleteCalendarEvent()` |
| `server/services/emailService.ts` | Added `sendBookingRequestReceived()`, `sendBookingConfirmation()`, `sendBookingNotification()`, `sendCancellationNotification()` |
| `src/components/BookingModal.tsx` | New file — the entire 4-step booking UI |
| `src/pages/LandingPage.tsx` | Moved modal state here from `App.tsx` when router was introduced |

---

## `prisma/schema.prisma` — The Booking Model

```prisma
model Booking {
  id                   Int       @id @default(autoincrement())
  name                 String
  email                String
  phone                String?
  message              String?
  slotTime             DateTime  @unique
  status               String    @default("pending")
  googleEventId        String?
  reminderSentAt       DateTime?
  reviewRequestSentAt  DateTime?
  createdAt            DateTime  @default(now())

  @@index([status, slotTime, reminderSentAt])
  @@index([status, slotTime, reviewRequestSentAt])
  @@index([email])
}
```

The most important field is `slotTime @unique`. The `@unique` constraint means the **database itself will reject** a second booking for the exact same datetime, even if two requests race through the application-level check at the same millisecond.

- `String?` — the `?` means nullable/optional, same as `Optional[str]` in Python
- `@unique` — creates a unique index in PostgreSQL. Attempting to insert a duplicate raises a database error with code `P2002`
- `status` — `"pending"` by default (awaiting trainer approval); becomes `"confirmed"` when the trainer confirms via the admin UI, or `"cancelled"` when declined/cancelled
- `googleEventId` — the Google Calendar event ID returned when the event is created. Stored so it can be deleted if the booking is cancelled. Nullable because calendar creation is non-fatal — if it fails, we have no ID to store.
- `reminderSentAt` / `reviewRequestSentAt` — cron job sentinel fields; `null` means the email hasn't been sent yet. The hourly cron filters on `reminderSentAt: null` to find bookings that need a reminder.

**`@@index` — query performance:**
The three `@@index` directives tell PostgreSQL to build multi-column indexes. Without them, the reminder and review-request cron queries (`WHERE status = 'confirmed' AND slotTime BETWEEN ... AND reminderSentAt IS NULL`) would do a full table scan on every tick. The index makes those lookups nearly instant regardless of how many bookings accumulate. `@@index([email])` supports any future query that looks up a client's bookings by email address.

**Running the migration:**
After any schema change, run:
```bash
npx prisma migrate dev --name <description>
```
This creates a SQL migration file and applies it to your database. Prisma also regenerates the TypeScript client automatically.

**Python analogy (SQLAlchemy):**
```python
class Booking(Base):
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    message = Column(String, nullable=True)
    slot_time = Column(DateTime, nullable=False, unique=True)  # ← the key constraint
    status = Column(String, default="confirmed")
    created_at = Column(DateTime, default=datetime.utcnow)
```

---

## `server/app.ts` — Express App Setup + Rate Limiting + Security Headers

Phase 3 split the Express setup out of `server/index.ts` into its own `server/app.ts` file. `index.ts` now only starts the server and schedules cron jobs. This separation lets tests import `app` directly without starting a real listener.

### Startup environment validation

```ts
const REQUIRED_ENV_VARS = [
  'DATABASE_URL', 'SESSION_SECRET', 'JWT_SECRET',
  'RESEND_API', 'TRAINER_EMAIL', 'ADMIN_EMAIL',
  'ADMIN_PASSWORD_HASH', 'OAUTH_CLIENT', 'OAUTH_SECRET', 'OAUTH_REDIRECT_URI',
];

const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[fatal] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
```

Before starting the server, `index.ts` checks that every required environment variable is present. If any are missing, it logs which ones and calls `process.exit(1)` — crashing immediately rather than starting up silently broken.

**Why fail at startup instead of at runtime?**
Without this guard, a misconfigured deploy (e.g. `SESSION_SECRET` not set) starts successfully, accepts traffic, and fails in subtle ways only when that path is exercised — `sendCancellationNotification` emails go to `undefined`, sessions sign with `undefined` as the secret, etc. Failing fast at startup makes misconfiguration obvious immediately rather than during a real user request.

**Python analogy:** Like calling `os.environ['KEY']` (which raises `KeyError`) instead of `os.environ.get('KEY')` for required config — combined with a startup check that exits before the app binds to a port.

### Security headers — `helmet`

```ts
import helmet from 'helmet';
app.use(helmet());
```

`helmet` is a small middleware that adds a set of HTTP security headers to every response with sensible defaults:

- `Content-Security-Policy` — restricts which resources the browser can load, limiting XSS impact
- `X-Frame-Options: DENY` — prevents the page from being embedded in an `<iframe>` (clickjacking protection)
- `X-Content-Type-Options: nosniff` — stops browsers from guessing the MIME type of a response
- `Strict-Transport-Security` — tells browsers to only use HTTPS for this domain going forward
- `Referrer-Policy` — controls how much URL info is sent in the `Referer` header

One line, meaningful security improvement — it's the standard first middleware line in any production Express app.

### Rate limiting

```ts
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 20,                   // max 20 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  skip: () => process.env.NODE_ENV === 'test', // disabled during test suite
});

// Stricter limit for the login endpoint — prevents brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

app.use('/api', apiLimiter);
app.use('/api/auth', loginLimiter, trainerAuthRouter);
```

Two rate limiters:

**`apiLimiter` (20/15 min)** — covers all `/api/*` routes. A normal visitor booking a session makes approximately 3–4 API calls (1–2 slot fetches + 1 booking POST), so 20 is a generous ceiling for legitimate use while stopping bots and spam scripts.

**`loginLimiter` (5/15 min)** — applied only to `/api/auth` (the login endpoint). The general `apiLimiter` already applies, but 20 attempts is far too many for a login endpoint — a brute-force script could try 20 passwords every 15 minutes. 5 attempts is strict enough to block automated attacks while being completely invisible to a legitimate trainer.

`standardHeaders: true` adds `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers to every response — useful for debugging.

**Python analogy:** Like a Flask `@limiter.limit("20 per 15 minutes")` decorator applied to an entire blueprint, with a separate `@limiter.limit("5 per 15 minutes")` on the login view.

---

## `server/middleware/requireJwt.ts` — Trainer Auth Guard

```ts
export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  const token = authHeader.slice(7); // strip 'Bearer '
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(503).json({ success: false, error: 'Auth not configured.' });
    return;
  }

  try {
    jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}
```

Protects trainer-only routes by verifying a JWT sent in the `Authorization` header as `Bearer <token>`.

**Why JWT instead of a static API key?** A static API key never expires — if it leaks, the attacker has permanent access. A JWT is signed with a secret (`JWT_SECRET`) and carries an expiry timestamp. The library (`jsonwebtoken`) verifies both the signature and expiry in one call. The trainer logs in via `/admin/login`, receives a JWT, and the frontend stores it in `localStorage` and sends it with each admin request.

**Fail closed:** If `JWT_SECRET` isn't set in `.env`, the middleware returns `503 Service Unavailable` rather than allowing requests through. This prevents accidentally open admin routes in a misconfigured environment.

**`next()`:** In Express, middleware functions receive a third argument `next` — a function that passes control to the next handler in the chain. If `next()` is called, Express continues to the route handler. If a response is sent instead, `next()` is not called and the chain stops.

**Python analogy:** Like a FastAPI `Depends(verify_token)` dependency, or a Flask `@requires_auth` decorator that aborts with 401.

**Middleware chain — how a request flows through the stack:**

```
Incoming request
    ↓
apiLimiter          ← applied to all /api/* routes in app.ts
    │ too many requests → 429 (stop here)
    ↓
Router matches path
    ↓
requireJwt          ← only on protected routes (GET/PATCH /api/bookings)
    │ missing/invalid token → 401 (stop here)
    ↓
Controller (getBookings / cancelBooking / etc.)
    ↓
Response sent

Public routes (POST /api/bookings, GET /api/slots) skip requireJwt entirely.
```

---

## `server/routes/bookings.ts` — Route File

```ts
import { Router } from 'express';
import { getBookings, createBooking, cancelBooking, rescheduleBooking, confirmBooking } from '../controllers/bookingController.ts';
import { requireJwt } from '../middleware/requireJwt.ts';

const router = Router();

// GET /api/bookings — trainer-only, requires valid JWT
router.get('/', requireJwt, getBookings);

// POST /api/bookings — public (rate-limited at the app level)
router.post('/', createBooking);

// PATCH /api/bookings/:id/cancel — trainer-only, requires valid JWT
router.patch('/:id/cancel', requireJwt, cancelBooking);

// PATCH /api/bookings/:id/reschedule — trainer-only, requires valid JWT
router.patch('/:id/reschedule', requireJwt, rescheduleBooking);

// PATCH /api/bookings/:id/confirm — trainer-only, requires valid JWT
router.patch('/:id/confirm', requireJwt, confirmBooking);

export default router;
```

Routes only map URLs to handlers — logic lives in the controller. When mounted at `/api/bookings` in `app.ts`:

- `GET /api/bookings` → JWT check → `getBookings`
- `POST /api/bookings` → open (rate-limited) → `createBooking`
- `PATCH /api/bookings/:id/cancel` → JWT check → `cancelBooking`
- `PATCH /api/bookings/:id/reschedule` → JWT check → `rescheduleBooking`
- `PATCH /api/bookings/:id/confirm` → JWT check → `confirmBooking`

Express route definitions accept multiple handler arguments: `router.get('/', middlewareA, middlewareB, handler)`. They run in order — if `middlewareA` sends a response (like a 401), `middlewareB` and `handler` never run.

---

## `server/controllers/bookingController.ts` — The Main Endpoint

This file has two exports: `getBookings` (trainer-only read) and `createBooking` (public write).

### `getBookings` — GET /api/bookings

```ts
export async function getBookings(req: Request, res: Response): Promise<void> {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { slotTime: 'desc' },
    });
    res.json({ success: true, data: bookings });
  } catch (err) {
    console.error('getBookings error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings.' });
  }
}
```

Returns all bookings ordered by `slotTime` descending (most recent first). Protected upstream by `requireJwt` — by the time this function runs, the JWT has already been verified.

`findMany` with no `where` clause returns every row. `orderBy: { slotTime: 'desc' }` maps to `ORDER BY "slotTime" DESC` in SQL.

**Python analogy:** `session.query(Booking).order_by(Booking.slot_time.desc()).all()` in SQLAlchemy.

---

### `cancelBooking` — PATCH /api/bookings/:id/cancel

```ts
export async function cancelBooking(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) { ... }  // 400 if :id isn't a number

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) { ... }                        // 404 if not found
  if (booking.status === 'cancelled') { ... }  // 409 if already cancelled

  // Update status — this is the authoritative change
  const updated = await prisma.booking.update({
    where: { id },
    data: { status: 'cancelled' },
  });

  // Delete calendar event — non-fatal
  if (booking.googleEventId) {
    try {
      await deleteCalendarEvent(booking.googleEventId);
    } catch (calErr) { console.error(...); }
  }

  // Notify trainer — non-fatal
  try {
    await sendCancellationNotification(booking);
  } catch (emailErr) { console.error(...); }

  // Notify client — non-fatal
  try {
    await sendClientCancellationEmail(booking);
  } catch (emailErr) { console.error(...); }

  res.json({ success: true, data: updated });
}
```

**Four-stage cancellation — same non-fatal pattern as booking creation:**

1. **DB update** — the only fatal step. If this fails, we 500. Status is now `"cancelled"` in the source of truth.
2. **Calendar delete** — non-fatal. If the event was already deleted manually in Google Calendar, the API returns 410 Gone. We log it but don't fail the request — the DB cancellation already happened.
3. **Trainer notification email** — non-fatal. Sends to `TRAINER_EMAIL` so the trainer knows one of their sessions was cancelled.
4. **Client notification email** — non-fatal. Sends to the client's email address so they know the session is off. Without this, a client whose booking was cancelled by the trainer would have no notification and might show up anyway.

**Why `PATCH /:id/cancel` instead of `DELETE /:id`?**
`DELETE` implies removing the row. We keep cancelled bookings in the database as a record. `PATCH` means "partially update this resource." The `/cancel` suffix makes the intent unambiguous — there's no accidental cancellation from a generic PATCH with a wrong body.

**Why check `googleEventId` before deleting?**
Calendar event creation is non-fatal. If it failed when the booking was created, `googleEventId` is `null` — there's nothing to delete and we skip the call entirely.

---

### `confirmBooking` — PATCH /api/bookings/:id/confirm

Called when the trainer clicks "Confirm booking" in the admin UI. This is the second half of the two-step booking flow — it finalizes a `"pending"` booking.

```ts
export async function confirmBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) { ... }                          // 404 if not found
  if (booking.status !== 'pending') { ... }      // 409 — only pending bookings can be confirmed

  // Flip status to confirmed — source of truth
  const updated = await prisma.booking.update({
    where: { id },
    data: { status: 'confirmed' },
  });

  // Create Google Calendar event — deferred from createBooking, non-fatal
  try {
    const googleEventId = await createCalendarEvent(updated);
    if (googleEventId) {
      await prisma.booking.update({ where: { id }, data: { googleEventId } });
    }
  } catch (calErr) { console.error(...); }

  // Send confirmation email to the client — non-fatal
  try {
    await sendBookingConfirmation(updated);
  } catch (emailErr) { console.error(...); }

  res.json({ success: true, data: updated });
}
```

**Why is the calendar event created here, not in `createBooking`?**
Until the trainer confirms, the booking is speculative — the slot is held but not approved. Creating a Google Calendar event before approval would clutter the trainer's calendar with unreviewed requests. By deferring to `confirmBooking`, the calendar only reflects real, approved sessions.

**Why can only `"pending"` bookings be confirmed?**
The `status !== 'pending'` guard prevents double-confirmation. If a booking is already `"confirmed"`, calling this endpoint again would re-create a second calendar event and re-send the confirmation email.

---

### `rescheduleBooking` — PATCH /api/bookings/:id/reschedule

```ts
export async function rescheduleBooking(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const { newSlotTime } = req.body as { newSlotTime?: string };

  // ... validate id, newSlotTime, find booking, check not cancelled ...

  // Reject if the trainer picked the same slot the booking already has
  if (booking.slotTime.getTime() === newSlotDate.getTime()) {
    res.status(409).json({ success: false, error: 'New slot is the same as the current slot.' });
    return;
  }

  // Check that no other active booking already occupies the new slot.
  const conflict = await prisma.booking.findFirst({
    where: {
      slotTime: newSlotDate,
      id: { not: id },
      status: { not: 'cancelled' },
    },
  });

  if (conflict) { ... }

  // Reset reminderSentAt so the 24h reminder fires again for the new time.
  const updated = await prisma.booking.update({
    where: { id },
    data: { slotTime: newSlotDate, reminderSentAt: null },
  });

  // Replace calendar event — non-fatal (delete old, create new).
  // Update booking with new googleEventId if creation succeeds.

  res.json({ success: true, data: updated });
}
```

Moves a confirmed booking to a new slot. Protected by `requireJwt` — trainer-only.

**Conflict check differs from `cancelBooking`'s:** We use `findFirst` with `status: { not: 'cancelled' }` rather than `findUnique`. Why? A cancelled booking keeps its `slotTime` in the database (we don't delete rows). If we used `findUnique`, a cancelled booking on the same slot would incorrectly block the reschedule. By filtering out cancelled bookings, we only block on *active* conflicts.

**`reminderSentAt: null`:** The reminder cron checks whether `reminderSentAt` is null before sending. If a booking was already reminded and then rescheduled, resetting this field ensures the client gets a fresh reminder 24h before the new time. Without this reset, the rescheduled booking would never get a reminder.

**Calendar replacement — non-fatal:** The old event is deleted first (if `googleEventId` is set), then a new event is created for the new slot. Both steps are wrapped in individual `try/catch` blocks. If the delete or create fails (e.g. Google API is down), the booking's database record is still updated correctly — the calendar is a convenience, not the source of truth.

---

### `createBooking` — POST /api/bookings

This is the core booking flow. It runs through five stages in order.

### The `isPrismaUniqueError` helper

```ts
function isPrismaUniqueError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    err.code === 'P2002'
  );
}
```

Prisma uses error code `P2002` for unique constraint violations (double-booking at the DB level). This helper safely checks for that code on an unknown error object.

**Why `typeof err === 'object'`?** In TypeScript's `catch` block, the caught value is typed as `unknown` (not `Error`), because JavaScript can `throw` anything — strings, numbers, objects, etc. We must narrow the type before accessing `.code`.

**Python analogy:** Like `isinstance(err, IntegrityError) and err.pgcode == '23505'` in psycopg2.

### Stage 1: Input Validation

```ts
const { name, email, phone, message, slotTime } = req.body as {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  slotTime?: string;
};

if (!name?.trim() || !email?.trim() || !slotTime) {
  res.status(400).json({ success: false, error: 'name, email, and slotTime are required.' });
  return;
}

if (name.trim().length > 100) { ... }    // 400 — name too long
if (phone && phone.trim().length > 20) { ... }  // 400 — phone too long
if (message && message.trim().length > 2000) { ... }  // 400 — message too long
```

- `req.body as { ... }` — we cast the body to the expected shape. TypeScript can't know the body type at compile time; this is our declaration of what it should look like.
- `name?.trim()` — the `?.` (optional chaining) calls `.trim()` only if `name` is not null/undefined. If `name` is missing, returns `undefined` (falsy). If `name` is `""` after trimming, also falsy. This catches both missing and whitespace-only submissions.
- `return` after sending a response — **always required in Express controllers**. Without it, the function would continue to the next stage and try to send a second response, causing a runtime error.

**Field length limits:**
Without server-side limits, a client bypassing the browser could POST a 10 MB `message` field — which would be stored in the database and forwarded to Resend. Enforcing limits at the API boundary prevents oversized inputs from ever reaching the DB or email service.

Then email format and date validity are also validated:
```ts
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slotDate = new Date(slotTime);
if (isNaN(slotDate.getTime())) { ... }  // invalid datetime string

// Reject past-date slots — the frontend enforces a 2-day minimum, but this
// catches direct API calls that bypass the UI
if (slotDate <= new Date()) {
  res.status(400).json({ success: false, error: 'slotTime must be a future date and time.' });
  return;
}
```

**Why validate the date server-side when the frontend already enforces it?**
The frontend's 2-day advance booking rule only protects normal browser users. A direct API call (`curl -X POST /api/bookings`) can supply any date, including past ones. The backend must never trust that frontend validation ran.

### Stage 2: API-Level Double-Booking Check

```ts
const existing = await prisma.booking.findUnique({ where: { slotTime: slotDate } });
if (existing) {
  res.status(409).json({
    success: false,
    error: 'This time slot has already been booked. Please choose another time.',
  });
  return;
}
```

Checks the database for an existing booking at this exact datetime. Returns `409 Conflict` if found.

This handles the **common case** — someone trying to book a slot that was taken 2 minutes ago. It's fast (one indexed lookup) and returns a clear, user-friendly error message.

**Why 409 and not 400?** HTTP 409 Conflict means "the request conflicts with the current state of the resource" — semantically more accurate than 400 Bad Request (which implies malformed input).

**Why two layers of protection (API check + DB constraint)?**

The API check handles the normal case. But there's a race condition the API check can't catch alone:

```
Without the DB @unique constraint:
  Request A: findUnique → slot is free → starts writing...
  Request B: findUnique → slot is free (A hasn't written yet!) → starts writing...
  → Both writes succeed → two bookings for the same slot!

With @unique on slotTime:
  Request A writes successfully.
  Request B's write is rejected by the DB with a unique constraint error (P2002).
  → The outer catch block converts that into the same 409 response.
```

The API check is the fast path for user-friendly errors. The DB constraint is the safety net for race conditions that happen in milliseconds.

### Stage 3: Save to Database

```ts
const booking = await prisma.booking.create({
  data: {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || null,
    message: message?.trim() || null,
    slotTime: slotDate,
  },
});
```

After passing both validations, the booking is saved. At this point the slot is claimed.

- `name.trim()` — strip whitespace. Same sanitization as Python's `str.strip()`.
- `email.trim().toLowerCase()` — normalize email addresses. `"User@Example.COM"` and `"user@example.com"` are the same address.
- `phone?.trim() || null` — optional field: trim if present, otherwise store `null` (not an empty string).

### Stage 4: Emails (Non-Fatal)

```ts
try {
  await sendBookingRequestReceived(booking); // "we received your request" → client
  await sendBookingNotification(booking);    // full details → trainer
} catch (emailErr) {
  console.error('Booking emails failed:', emailErr);
}
```

At this stage the booking is `"pending"`. The client gets a holding email ("we'll confirm shortly"), and the trainer gets a notification so they can review the request in the admin dashboard.

**What's deferred:** the confirmation email and the Google Calendar event are NOT created here — they only happen when the trainer hits "Confirm booking" in the admin UI. This keeps the client's inbox clean and the calendar free of unreviewed bookings.

### The Response — Safe Fields Only

```ts
res.status(201).json({
  success: true,
  data: {
    id:       booking.id,
    name:     booking.name,
    email:    booking.email,
    slotTime: booking.slotTime,
    status:   booking.status,
  },
});
```

Rather than returning the full Prisma `Booking` object, only the fields a client needs are returned. This prevents leaking internal tracking fields (`googleEventId`, `reminderSentAt`, `reviewRequestSentAt`) that have no business being in a public API response. The `googleEventId` in particular would expose the trainer's Google Calendar provider and a usable event ID.

**General rule:** always construct explicit response objects from public-safe fields rather than returning raw database rows.

### The Race Condition Handler

```ts
} catch (err) {
  if (isPrismaUniqueError(err)) {
    res.status(409).json({
      success: false,
      error: 'This time slot has already been booked. Please choose another time.',
    });
    return;
  }
  res.status(500).json({ success: false, error: 'Failed to create booking.' });
}
```

At the outer catch level: if the error is a Prisma `P2002` (unique constraint violation), it means two requests raced through the Stage 2 check simultaneously and both tried to write. The database rejected the second one. We return the same 409 error — the user experience is identical to the Stage 2 catch.

**Visualizing the two-layer protection:**

```
Request A arrives               Request B arrives (1ms later)
       │                               │
       ▼                               ▼
Stage 2: findUnique()           Stage 2: findUnique()
  → no booking found               → no booking found (A hasn't written yet!)
       │                               │
       ▼                               ▼
Stage 3: prisma.create()        Stage 3: prisma.create()
  → INSERT succeeds ✓              → INSERT fails! P2002 unique constraint
       │                               │
       ▼                               ▼
  201 Created                     409 Conflict (caught in outer catch)
```

---

## `server/services/calendarService.ts` — Calendar Functions

### `createCalendarEvent()`

```ts
export async function createCalendarEvent(booking: BookingForCalendar): Promise<string | null> {
  // ... build and insert the event ...
  const response = await calendar.events.insert({ ... });
  return response.data.id ?? null; // return the event ID for storage
}
```

Changed from `Promise<void>` to `Promise<string | null>` — it now returns the Google Calendar event ID so `createBooking` can store it on the `Booking` record. That stored ID is what lets `cancelBooking` find and delete the right event later.

Returns `null` (not throws) if Google doesn't return an ID — keeps the call site non-fatal.

**Step by step:**

1. `getAuthenticatedClient()` — reuses the Phase 2 function that loads and auto-refreshes the OAuth token.

2. `sessionEnd` — adds 1 hour (3,600,000 milliseconds) to the slot start. All sessions are 1 hour.

3. `descriptionLines` — builds the event description from available booking fields. Only includes phone and notes if they were provided. `.filter((line): line is string => line !== null)` removes the `null` entries from the array. The `: line is string` part is a TypeScript **type guard** — it tells TypeScript that after filtering, the array only contains strings, not `string | null`.

4. `calendar.events.insert(...)` — creates the event on the trainer's primary calendar. `sendUpdates: 'all'` tells Google to email a proper calendar invite (with Accept / Decline / Maybe) to every attendee. Without this, Google's API defaults to `'none'`, which adds the client to the event silently — they'd only see a reminder, not an actionable invite. The `attendees` array sets who gets that invite.

5. `response.data.id ?? null` — the `??` (nullish coalescing) operator returns the right side only if the left is `null` or `undefined`. Like Python's `response.data.get('id') or None`.

### `deleteCalendarEvent()`

```ts
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const authClient = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  await calendar.events.delete({ calendarId: 'primary', eventId });
}
```

Deletes a calendar event by its ID. Called from `cancelBooking` — if the trainer already deleted the event manually, Google returns 410 Gone. The caller catches that and logs it rather than failing.

**Scope change from Phase 2:**
Phase 2 used `calendar.readonly` (read-only). Phase 3 requires `calendar.events` (read + write for events). The trainer must visit `/auth/google` once after Phase 3 is deployed to get a new token with the broader scope. The `upsert` in `saveTokensFromCode` overwrites the old token automatically.

**Scope validation (added post-debug):**
`saveTokensFromCode` now checks that Google actually granted `calendar.events` before saving the token. If the scope isn't registered in Google Cloud Console, Google silently downgrades the token — the auth flow appears to succeed but all calendar calls fail later. The validation throws an explicit error immediately so the problem is obvious at auth time rather than at booking time.

---

## `server/services/emailService.ts` — Booking Emails

### `formatSlotTime(date)`

```ts
function formatSlotTime(date: Date): string {
  const timezone = process.env.TRAINER_TIMEZONE ?? 'UTC';
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
// Output: "Friday, March 20, 2026 at 6:00 PM"
```

Formats the slot datetime for email display in the trainer's local timezone. `toLocaleString` handles timezone conversion and formatting in one call. `TRAINER_TIMEZONE` should be an IANA timezone string like `"America/New_York"`.

**Why format in the trainer's timezone for emails?**
The `slotTime` is stored in UTC in the database. The trainer reads their email in their local timezone. If `TRAINER_TIMEZONE` is set correctly, both parties see the same clock time even if the server runs in UTC.

### `FROM_ADDRESS` — Configurable Sender

```ts
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'JJM Fitness <onboarding@resend.dev>';
```

Every outbound email uses this constant as the `from` field. By reading from `RESEND_FROM_EMAIL` in `.env`, the sender can be overridden per environment without touching code. The fallback (`onboarding@resend.dev`) is Resend's shared sandbox address for development. In production, set `RESEND_FROM_EMAIL` to your verified domain (e.g. `JJM Fitness <noreply@jjmfitness.com>`) to avoid spam filters and present a professional sender.

### `sendBookingRequestReceived(booking)` — To the Client on Submission

Sent immediately when the client submits the booking form, before the trainer has reviewed it. Tells them:
- The session time they requested
- Their booking details
- That the trainer will confirm shortly

This is the "holding" email — it acknowledges the request without over-promising. The client gets a second email (`sendBookingConfirmation`) once the trainer approves.

### `sendBookingConfirmation(booking)` — To the Visitor on Confirm

Sends the full confirmation email to the client's address once the trainer approves:
- The confirmed session date/time
- A summary of their booking details
- A note to contact the trainer to cancel/reschedule

All user-supplied fields (`booking.name`, etc.) pass through `escapeHtml()` before being embedded in the HTML — same XSS prevention pattern from Phase 1.

### `sendBookingNotification(booking)` — To the Trainer

Sends a full booking summary to `process.env.TRAINER_EMAIL` including all fields (name, email, phone, time, notes).

### `sendClientCancellationEmail(booking)` — To the Client on Cancel

```ts
export async function sendClientCancellationEmail(booking: BookingDetails): Promise<void> {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: booking.email,
    subject: `Your session on ${formattedTime} has been cancelled`,
    html: `...`,
  });
}
```

Sent when the trainer cancels a booking. Without this email, a client who booked a session would have no notification and might show up to a cancelled appointment. The trainer's cancellation handler calls both `sendCancellationNotification` (to the trainer's own email as a record) and `sendClientCancellationEmail` (to the client), both non-fatal.

---

## `src/components/BookingModal.tsx` — The 4-Step Wizard

### State Overview

```ts
type Step = 'date' | 'time' | 'form' | 'success';

const [step, setStep] = useState<Step>('date');
const [selectedDate, setSelectedDate] = useState<string | null>(null);
const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
const [slots, setSlots] = useState<string[]>([]);
const [slotsLoading, setSlotsLoading] = useState(false);
const [slotsError, setSlotsError] = useState(false);   // boolean — true if the fetch failed
const [formData, setFormData] = useState<FormData>(initialFormData);
const [isSubmitting, setIsSubmitting] = useState(false);
const [submitError, setSubmitError] = useState<string | null>(null);
const [confirmedSlot, setConfirmedSlot] = useState<string | null>(null);
const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
```

**Why so many state variables?**
Each represents a distinct, independent piece of information. You could combine some into objects, but flat state variables are easier to read and update individually. The React docs recommend starting flat and only grouping when it clearly helps.

The `step` variable controls which screen is rendered — like a page variable in a state machine.

### Three `useEffect`s

```ts
// 1. Escape key closes the modal
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [onClose]);

// 2. Lock body scroll while modal is open
useEffect(() => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
  return () => { document.body.style.overflow = ''; };
}, [isOpen]);

// 3. Reset all state 300ms after modal closes (lets close animation finish)
useEffect(() => {
  if (!isOpen) {
    const timer = setTimeout(() => {
      setStep('date');
      setSelectedDate(null);
      // ... reset everything
    }, 300);
    return () => clearTimeout(timer);
  }
}, [isOpen]);
```

These three `useEffect`s are the same patterns from the Phase 1 `ContactModal`. See Phase 1 walkthrough for detailed explanations.

The 300ms reset delay is important: if you reset state immediately when the modal closes, you'd see the form flicker back to its initial state during the close animation.

### Step 1: Date Picker

```ts
const daysInMonth = getDaysInMonth(viewYear, viewMonth);
const firstDayOffset = getFirstDayOfWeek(viewYear, viewMonth);

const cells: (number | null)[] = [
  ...Array<null>(firstDayOffset).fill(null),  // padding cells
  ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
];
```

**How the calendar grid is built:**

A calendar grid has 7 columns (one per day of the week). If March 1st falls on a Wednesday (day 3), the first three cells need to be empty padding to align day 1 under Wednesday.

- `firstDayOffset` — what day of the week (0=Sun, 6=Sat) the 1st falls on
- `Array(firstDayOffset).fill(null)` — creates `[null, null, null]` for padding
- `Array.from({ length: daysInMonth }, (_, i) => i + 1)` — creates `[1, 2, 3, ..., 31]`
- The spread `...` merges them: `[null, null, null, 1, 2, 3, ..., 31]`

```
Sun  Mon  Tue  Wed  Thu  Fri  Sat
null null null   1    2    3    4
  5    6    7    8    9   10   11
 ...
```

**Python analogy:**
```python
cells = [None] * first_day_offset + list(range(1, days_in_month + 1))
```

**Disabled dates (2-day advance rule):**
```ts
// Earliest selectable date: 2 calendar days from today (same rule as the backend)
const _earliest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
const earliestBookableStr = toDateStr(_earliest.getFullYear(), _earliest.getMonth(), _earliest.getDate());

// In the calendar grid:
const isTooSoon = dateStr < earliestBookableStr;  // YYYY-MM-DD string comparison is safe
```

Any date before 2 calendar days from today is grayed out and unclickable. The cutoff is computed as a `YYYY-MM-DD` string so the comparison avoids timezone issues from `new Date('YYYY-MM-DD')` parsing as UTC. This matches the backend's `earliestBookable` logic in `getAvailableSlots` exactly — if the frontend let you pick a date, the backend would return zero slots for it anyway.

**When a date is selected:**
```ts
const handleDateSelect = (dateStr: string) => {
  setSelectedDate(dateStr);
  setSelectedSlot(null);   // clear any previously selected slot
  setStep('time');
  fetchSlots(dateStr);     // start loading slots in background
};
```

`fetchSlots` is called immediately — the loading spinner shows while it runs. The step advances to `'time'` so the user sees the loading state right away.

### Step 2: Time Slot Selector

```ts
const fetchSlots = useCallback(async (dateStr: string) => {
  setSlotsLoading(true);
  setSlotsError(null);
  setAvailableSlots([]);

  try {
    const res = await fetch(`/api/slots?date=${dateStr}`);
    const json = await res.json() as { success: boolean; data?: string[]; error?: string };

    if (!res.ok || !json.success) {
      setSlotsError(json.error ?? 'Could not load slots for this date.');
      return;
    }

    setAvailableSlots(json.data ?? []);
  } catch {
    setSlotsError('Network error. Please try again.');
  } finally {
    setSlotsLoading(false);
  }
}, []);
```

**`useCallback`:** Wraps the function so it doesn't get recreated on every render. Without `useCallback`, the function is a new object every render — which would cause `useEffect`s that depend on it to re-run unnecessarily. The empty `[]` dependency array means "create this function once and never recreate it."

**Four UI states handled:**
- Loading (`slotsLoading === true`) → spinner
- Error (`slotsError !== null`) → error message + "Try again"
- No slots (`availableSlots.length === 0`) → "No slots available" + "Choose a different date"
- Slots available → grid of time buttons

Each slot time is formatted for display using `formatSlotTime(iso)`:
```ts
function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
// "2026-03-20T22:00:00.000Z" → "6:00 PM" (if visitor is in Eastern time)
```

The ISO string is in UTC. `toLocaleTimeString` automatically converts to the visitor's local timezone — so visitors in different timezones see the time in their own zone.

### Step 3: Booking Form

```ts
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedSlot) return;

  setIsSubmitting(true);
  setSubmitError(null);

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, slotTime: selectedSlot }),
    });

    const json = await res.json() as { success: boolean; error?: string };

    if (!res.ok || !json.success) {
      setSubmitError(json.error ?? 'Something went wrong. Please try again.');
      return;
    }

    setConfirmedSlot(selectedSlot);
    setConfirmedEmail(formData.email);
    setStep('success');
  } catch {
    setSubmitError('Network error. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
```

**`{ ...formData, slotTime: selectedSlot }`** — spread the form data object and add `slotTime`. The `...` spread is like Python's `{**form_data, 'slotTime': selected_slot}`.

**Why save `confirmedSlot` and `confirmedEmail` before advancing to success?**
The success screen displays these values. When the modal eventually closes, all state is reset — including `selectedSlot` and `formData`. By copying the values into dedicated `confirmed*` state variables *before* the step changes, the success screen can display them even after the form is cleared.

### Step 4: Success Screen

```tsx
const renderSuccessStep = () => (
  <div className="flex flex-col items-center gap-3 py-8 text-center">
    <i className="bx bx-check-circle text-yellow-400 text-6xl" />
    <h2 className="text-2xl font-extrabold text-white">You're booked!</h2>
    {confirmedSlot && <p>{formatBookingTime(confirmedSlot)}</p>}
    {confirmedEmail && <p>A confirmation email has been sent to {confirmedEmail}.</p>}
    <button onClick={onClose}>Done</button>
  </div>
);
```

Simple confirmation screen. The `{confirmedSlot && <p>...}` pattern is React's conditional rendering — if `confirmedSlot` is truthy, render the `<p>`. If `null`, render nothing. Like Python's `f"{confirmedSlot}" if confirmedSlot else ""` but directly in JSX.

### Overlay Click to Close

```ts
const handleOverlayClick = (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) onClose();
};
```

Same pattern as `ContactModal`. `e.target` is what was clicked. `e.currentTarget` is the overlay backdrop. Only close if they're the same — meaning the user clicked the backdrop, not inside the modal.

---

## `src/pages/LandingPage.tsx` — Wiring the Modal

```tsx
export function LandingPage() {
  const [contactOpen, setContactOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <>
      <Header onOpenModal={() => setBookingOpen(true)} />
      <main>
        <HeroSection onOpenModal={() => setBookingOpen(true)} />
        <AboutSection onOpenModal={() => setBookingOpen(true)} />
        <PlansSection onOpenModal={() => setBookingOpen(true)} />
        ...
      </main>
      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
      <BookingModal isOpen={bookingOpen} onClose={() => setBookingOpen(false)} />
    </>
  );
}
```

Phase 3 added `BookingModal` alongside the existing `ContactModal`. The modal state (`bookingOpen`) lives in `LandingPage` (which was `App` in Phase 1 before routing was introduced in Phase 4). All "Book a Session" CTAs open `BookingModal` by calling the `onOpenModal` prop passed down from `LandingPage`.

Both modals are rendered at the `LandingPage` level — not inside individual section components. This is "lifting state up" — the state lives at the highest point shared by all components that need it.

---

## Full End-to-End Request Flow (Phase 3)

```
Visitor                   BookingModal                  Server                     External Services
   │                            │                          │                             │
   │  clicks "Book a Session"   │                          │                             │
   │──────────────────────────►│                          │                             │
   │                            │ setBookingOpen(true)     │                             │
   │                            │ step = 'date'            │                             │
   │                            │                          │                             │
   │  picks a date              │                          │                             │
   │──────────────────────────►│                          │                             │
   │                            │ setStep('time')          │                             │
   │                            │── GET /api/slots?date= ─►│                             │
   │                            │                          │ validate date               │
   │                            │                          │ load OAuth token from DB    │
   │                            │                          │── freebusy.query() ────────►│ Google Calendar
   │                            │                          │◄── busy blocks ─────────────│
   │                            │                          │ filter candidates           │
   │                            │◄── ["2026-...", ...] ───│                             │
   │◄── time slot buttons ──────│                          │                             │
   │                            │                          │                             │
   │  picks a time slot         │                          │                             │
   │──────────────────────────►│                          │                             │
   │                            │ setStep('form')          │                             │
   │◄── booking form ───────────│                          │                             │
   │                            │                          │                             │
   │  fills in details          │                          │                             │
   │  clicks "Confirm Booking"  │                          │                             │
   │──────────────────────────►│                          │                             │
   │                            │── POST /api/bookings ───►│                             │
   │                            │   { name, email, slotTime }                            │
   │                            │                          │ validate inputs             │
   │                            │                          │ check: slot taken? (no)     │
   │                            │                          │── prisma.booking.create()   │
   │                            │                          │      └── INSERT (unique ok) │
   │                            │                          │── createCalendarEvent() ───►│ Google Calendar
   │                            │                          │                             │── event created
   │                            │                          │── sendBookingConfirmation() ►│ Resend
   │                            │                          │                             │── email → visitor
   │                            │                          │── sendBookingNotification() ►│ Resend
   │                            │                          │                             │── email → trainer
   │                            │◄── { success: true } ───│                             │
   │                            │ setStep('success')       │                             │
   │◄── "You're booked!" ───────│                          │                             │
```

---

## Trainer Setup Notes

**Re-authorization required after Phase 3 deploy:** The Google Calendar OAuth scope changed from `calendar.readonly` (Phase 2) to `calendar.events` (Phase 3). The old token cannot create or delete events. The trainer must visit `/auth/google` once — `upsert` in `saveTokensFromCode()` overwrites the old token automatically.

**JWT-based auth replaces static API key:** Phase 3 replaced the `requireApiKey` middleware (which compared a header value against `ADMIN_API_KEY`) with `requireJwt`. The trainer now logs in at `/admin/login`, receives a signed JWT, and the frontend sends it as `Authorization: Bearer <token>` on all admin requests.

---

## Key Concepts Summary

| Concept | Where used | Python analogy |
|---|---|---|
| `useCallback` | `fetchSlots` in BookingModal | `functools.lru_cache` for stable reference |
| `type Step = 'date' \| 'time' \| ...` | `step` state | Python `Literal['date', 'time', ...]` type hint |
| `409 Conflict` | Double-booking response | `HTTPException(status_code=409)` in FastAPI |
| `P2002` error code | Prisma unique constraint | `psycopg2.IntegrityError` + pgcode `23505` |
| `?.` optional chaining | `busyBlocks` access | `dict.get()` chaining |
| Non-fatal try/catch | Calendar + email calls | `try/except` with `pass` and a `logger.error` |
