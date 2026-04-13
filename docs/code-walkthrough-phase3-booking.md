# Code Walkthrough — Phase 3: Booking System

**Audience:** Someone who knows Python well and is learning TypeScript/React at a beginner–intermediate level.

---

## What Phase 3 Built

The complete end-to-end booking experience:
- A 4-step UI wizard (date → time → form → confirmation)
- A backend endpoint that saves the booking, creates a Google Calendar event, and sends emails to both the visitor and the trainer
- Two-layer double-booking protection
- Rate limiting on all API routes

---

## Topology

```
Browser
└── src/App.tsx
    └── BookingModal.tsx          ← 4-step wizard (date → time → form → success)
        │
        │  Step 2: GET /api/slots?date=YYYY-MM-DD
        │          (covered in Phase 2 walkthrough)
        │
        │  Step 3: POST /api/bookings
        │          body: { name, email, phone?, message?, slotTime }
        ▼
Express Server (server/index.ts)
├── Rate limiter ──────────────── applied to all /api/* routes (SEC-04)
└── /api/bookings → server/routes/bookings.ts
                        └── server/controllers/bookingController.ts
                                │
                                │ 1. Validate: name, email, slotTime required
                                │ 2. Check: is slot already booked? (API-level)
                                │ 3. Save:   prisma.booking.create()
                                │               └── PostgreSQL (Booking table)
                                │               └── @unique on slotTime = DB-level guard
                                │
                                │ 4. (non-fatal) Create Google Calendar event
                                │       └── server/services/calendarService.ts
                                │               └── createCalendarEvent()
                                │                       └── Google Calendar API
                                │
                                │ 5. (non-fatal) Send emails
                                │       └── server/services/emailService.ts
                                │               ├── sendBookingConfirmation() → visitor's inbox
                                │               └── sendBookingNotification() → trainer's inbox
                                │                       └── Resend API
                                │
                                └── respond: { success: true, data: booking }
```

---

## Files Changed in Phase 3 + Cancellation

| File | What changed |
|------|-------------|
| `prisma/schema.prisma` | Added `Booking` model; `googleEventId String?` added for cancellation support |
| `server/routes/bookings.ts` | New file — GET (admin), POST (public), PATCH /:id/cancel (admin) |
| `server/controllers/bookingController.ts` | `createBooking`, `getBookings`, `cancelBooking` |
| `server/middleware/requireApiKey.ts` | New file — API key guard for trainer-only routes |
| `server/services/calendarService.ts` | Added `createCalendarEvent()` (returns event ID), `deleteCalendarEvent()` |
| `server/services/emailService.ts` | Added `sendBookingConfirmation()`, `sendBookingNotification()`, `sendCancellationNotification()` |
| `server/index.ts` | Added `express-rate-limit` + mounted `/api/bookings` route |
| `src/components/BookingModal.tsx` | New file — the entire 4-step booking UI |
| `src/App.tsx` | Wired `BookingModal` to all "Book a Session" CTA buttons |

---

## `prisma/schema.prisma` — The Booking Model

```prisma
model Booking {
  id            Int      @id @default(autoincrement())
  name          String
  email         String
  phone         String?
  message       String?
  slotTime      DateTime @unique
  status        String   @default("confirmed")
  googleEventId String?
  createdAt     DateTime @default(now())
}
```

The most important field is `slotTime @unique`. The `@unique` constraint means the **database itself will reject** a second booking for the exact same datetime, even if two requests race through the application-level check at the same millisecond.

- `String?` — the `?` means nullable/optional, same as `Optional[str]` in Python
- `@unique` — creates a unique index in PostgreSQL. Attempting to insert a duplicate raises a database error with code `P2002`
- `status` — `"confirmed"` by default, set to `"cancelled"` when the trainer cancels
- `googleEventId` — the Google Calendar event ID returned when the event is created. Stored so it can be deleted if the booking is cancelled. Nullable because calendar creation is non-fatal — if it fails, we have no ID to store.

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

## `server/index.ts` — Rate Limiting (SEC-04)

```ts
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 20,                   // max 20 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

app.use('/api', apiLimiter);
```

This middleware runs before any route handler. Every request to `/api/*` is counted per IP address. If an IP exceeds 20 requests in 15 minutes, subsequent requests receive `429 Too Many Requests`.

**Why 20 requests?**
A normal visitor booking a session makes approximately 3–4 API calls:
- 1–2 calls to fetch slots for different dates
- 1 call to POST the booking

So 20 is a generous ceiling for legitimate use, but will stop automated bots or spam scripts.

`standardHeaders: true` adds `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers to every response — useful for debugging.

**Python analogy:** Like a Flask `@limiter.limit("20 per 15 minutes")` decorator applied to an entire blueprint.

---

## `server/middleware/requireApiKey.ts` — Admin Route Guard

```ts
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    res.status(503).json({ success: false, error: 'Admin access is not configured.' });
    return;
  }

  if (!key || key !== expected) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  next();
}
```

A middleware function that protects trainer-only endpoints with a static API key.

**Why an API key instead of sessions?** Sessions are good for browsers. An admin check of the bookings list is more of a server-to-server or direct API call (e.g. `curl -H "x-api-key: ..."`) — an API key is simpler and appropriate for a solo use case with no user login system.

**Fail closed:** If `ADMIN_API_KEY` isn't set in `.env`, the middleware returns `503 Service Unavailable` instead of allowing the request through. This prevents accidentally open admin routes in a misconfigured environment.

**`next()`:** In Express, middleware functions receive a third argument `next` — a function that passes control to the next handler in the chain. If `next()` is called, Express continues to the route handler (`getBookings`). If a response is sent instead, `next()` is not called and the chain stops.

**Python analogy:** Like a FastAPI `Depends(verify_api_key)` dependency, or a Flask `@requires_auth` decorator that aborts with 401.

---

## `server/routes/bookings.ts` — Route File

```ts
import { Router } from 'express';
import { getBookings, createBooking } from '../controllers/bookingController.ts';
import { requireApiKey } from '../middleware/requireApiKey.ts';

const router = Router();

// GET /api/bookings — trainer-only, requires x-api-key header
router.get('/', requireApiKey, getBookings);

// POST /api/bookings — public (rate-limited at the app level)
router.post('/', createBooking);

export default router;
```

Routes only map URLs to handlers — logic lives in the controller. When mounted at `/api/bookings` in `index.ts`:

- `GET /api/bookings` → checks API key → `getBookings`
- `POST /api/bookings` → open (rate-limited) → `createBooking`

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

Returns all bookings ordered by `slotTime` descending (most recent first). Protected upstream by `requireApiKey` — by the time this function runs, the key has already been verified.

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

  res.json({ success: true, data: updated });
}
```

**Three-stage cancellation — same non-fatal pattern as booking creation:**

1. **DB update** — the only fatal step. If this fails, we 500. Status is now `"cancelled"` in the source of truth.
2. **Calendar delete** — non-fatal. If the event was already deleted manually in Google Calendar, the API returns 410 Gone. We log it but don't fail the request — the DB cancellation already happened.
3. **Trainer notification email** — non-fatal. If Resend is down, the trainer at least has the DB record.

**Why `PATCH /:id/cancel` instead of `DELETE /:id`?**
`DELETE` implies removing the row. We keep cancelled bookings in the database as a record. `PATCH` means "partially update this resource." The `/cancel` suffix makes the intent unambiguous — there's no accidental cancellation from a generic PATCH with a wrong body.

**Why check `googleEventId` before deleting?**
Calendar event creation is non-fatal. If it failed when the booking was created, `googleEventId` is `null` — there's nothing to delete and we skip the call entirely.

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
```

- `req.body as { ... }` — we cast the body to the expected shape. TypeScript can't know the body type at compile time; this is our declaration of what it should look like.
- `name?.trim()` — the `?.` (optional chaining) calls `.trim()` only if `name` is not null/undefined. If `name` is missing, returns `undefined` (falsy). If `name` is `""` after trimming, also falsy. This catches both missing and whitespace-only submissions.
- `return` after sending a response — **always required in Express controllers**. Without it, the function would continue to the next stage and try to send a second response, causing a runtime error.

Then email format and date validity are also validated:
```ts
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slotDate = new Date(slotTime);
if (isNaN(slotDate.getTime())) { ... }  // invalid datetime string
```

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

### Stage 4: Google Calendar Event (Non-Fatal)

```ts
try {
  await createCalendarEvent(booking);
} catch (calErr) {
  console.error('Google Calendar event creation failed:', calErr);
}
```

Wrapped in its own isolated `try/catch`. If the Google API is down or the token expired, **the booking is not undone** — it's already saved to the database. The trainer might need to manually add it to their calendar in the rare case this fails, but the visitor's booking is secure.

**This is an intentional design choice:** the booking record is the source of truth. The calendar event is a convenience, not a dependency.

### Stage 5: Confirmation Emails (Non-Fatal)

```ts
try {
  await sendBookingConfirmation(booking);
  await sendBookingNotification(booking);
} catch (emailErr) {
  console.error('Booking emails failed:', emailErr);
}
```

Same pattern — separate `try/catch`, non-fatal. If Resend is unreachable, the booking still succeeds.

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

4. `calendar.events.insert(...)` — creates the event on the trainer's primary calendar. The `attendees` array adds the client — Google will send them a calendar invite to their email.

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

### `sendBookingConfirmation(booking)` — To the Visitor

Sends a confirmation email to the client's address with:
- The confirmed session date/time
- A summary of their booking details
- A note to contact the trainer to cancel/reschedule

All user-supplied fields (`booking.name`, etc.) pass through `escapeHtml()` before being embedded in the HTML — same XSS prevention pattern from Phase 1.

### `sendBookingNotification(booking)` — To the Trainer

Sends a full booking summary to `process.env.TRAINER_EMAIL` including all fields (name, email, phone, time, notes).

---

## `src/components/BookingModal.tsx` — The 4-Step Wizard

### State Overview

```ts
type Step = 'date' | 'time' | 'form' | 'success';

const [step, setStep] = useState<Step>('date');
const [selectedDate, setSelectedDate] = useState<string | null>(null);
const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
const [availableSlots, setAvailableSlots] = useState<string[]>([]);
const [slotsLoading, setSlotsLoading] = useState(false);
const [slotsError, setSlotsError] = useState<string | null>(null);
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

**Disabled past days:**
```ts
const isPastDay = (day: number) => {
  const d = new Date(viewYear, viewMonth, day);
  return d < todayMidnight;
};
```

Comparing `Date` objects in JavaScript works like Python's `datetime` comparison — `<` and `>` work directly.

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

## `src/App.tsx` — Wiring the Modal

```tsx
export default function App() {
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

Phase 3 adds a second modal state (`bookingOpen`) alongside the existing `contactOpen` from Phase 1. All "Book a Session" CTAs now open `BookingModal` instead of `ContactModal`.

Both modals are rendered at the root (`App`) level — not inside individual section components. This is "lifting state up" — the state lives at the highest point shared by all components that need it. Any component can open the modal by calling the callback passed as `onOpenModal`.

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

## Trainer Setup Note: Re-Authorization Required

The Google Calendar OAuth scope was changed from `calendar.readonly` (Phase 2) to `calendar.events` (Phase 3). The old token in the database was issued with the narrower scope and **cannot create events**.

After deploying Phase 3, the trainer must visit `/auth/google` once to re-authorize. The `upsert` in `saveTokensFromCode()` overwrites the old token automatically — no manual cleanup needed.

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
