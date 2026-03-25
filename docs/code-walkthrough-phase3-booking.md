# Code Walkthrough: Phase 3 — Booking System

**Phase goal:** A visitor can browse available dates, pick a time slot, fill in their details, and confirm a booking — with confirmation emails sent to both parties and a Google Calendar event created for the trainer.

---

## Overview of what was built

| File | What it does |
|------|-------------|
| `prisma/schema.prisma` | Added `Booking` model with `@unique` on `slotTime` |
| `server/controllers/bookingController.ts` | Handles `POST /api/bookings` — validates, double-booking check, saves, fires calendar + emails |
| `server/routes/bookings.ts` | Mounts the booking controller at `/api/bookings` |
| `server/services/calendarService.ts` | Added `createCalendarEvent()` — creates an event in the trainer's Google Calendar |
| `server/services/emailService.ts` | Added `sendBookingConfirmation()` and `sendBookingNotification()` |
| `server/index.ts` | Added rate limiting middleware (SEC-04) + mounted bookings route |
| `src/components/BookingModal.tsx` | 4-step booking UI: date picker → time slots → booking form → success screen |
| `src/App.tsx` | Wired `BookingModal` to all "Book a Session" CTAs |

---

## Database: `prisma/schema.prisma`

```prisma
model Booking {
  id        Int      @id @default(autoincrement())
  name      String
  email     String
  phone     String?
  message   String?
  slotTime  DateTime @unique
  status    String   @default("confirmed")
  createdAt DateTime @default(now())
}
```

The most important field here is `slotTime @unique`. The `@unique` constraint means the database will **reject a second booking for the exact same datetime at the storage level** — even if two requests arrive at exactly the same millisecond and both slip through the application-level check. This is the second layer of double-booking protection (BOOK-04).

The `status` field defaults to `"confirmed"` and is reserved for future use (e.g. "cancelled").

---

## Backend Route: `server/routes/bookings.ts`

Short and simple — just mounts the controller on `POST /`.

```ts
router.post('/', createBooking);
```

Combined with `app.use('/api/bookings', bookingsRouter)` in `index.ts`, this means:
`POST /api/bookings` → `createBooking`

---

## Controller: `server/controllers/bookingController.ts`

This is the main entry point for creating a booking. It runs through these stages in order:

### 1. Input validation
```ts
if (!name?.trim() || !email?.trim() || !slotTime) { ... }
```
Checks that the three required fields are present and non-empty. Returns 400 immediately on failure (early return pattern — avoids nesting).

Also validates email format with a regex and that `slotTime` parses as a real `Date`.

### 2. API-level double-booking check
```ts
const existing = await prisma.booking.findUnique({ where: { slotTime: slotDate } });
if (existing) { res.status(409).json(...); return; }
```
Looks up whether a booking already exists for this exact time. Returns 409 Conflict if so.

This handles the **common case** — a user submitting a slot that another user booked a minute ago. It's fast (one DB read), and it gives a clear, specific error message.

The `@unique` constraint on `slotTime` is the **safety net** for the race condition case (two requests arrive simultaneously and both pass this check before either writes). In that case, the second `prisma.booking.create()` throws a Prisma error with code `P2002`, which is caught at the bottom of the try/catch.

### 3. Save to database
```ts
const booking = await prisma.booking.create({ data: { ... } });
```
Creates the booking record. At this point the slot is claimed.

### 4. Google Calendar event (non-fatal)
```ts
try {
  await createCalendarEvent(booking);
} catch (calErr) {
  console.error('Google Calendar event creation failed:', calErr);
}
```
Wrapped in its own try/catch so a calendar API failure **does not undo the booking**. The booking is already saved. The trainer might need to manually add it to their calendar if this fails, but the visitor's booking is secure.

### 5. Confirmation emails (non-fatal)
Same pattern — wrapped in its own try/catch. Sending the visitor's confirmation email and the trainer's notification are both non-fatal.

### 6. P2002 error handling
```ts
if (isPrismaUniqueError(err)) { res.status(409).json(...); }
```
At the bottom of the outer catch, this checks for the Prisma unique constraint violation code. This is the DB-level race condition protection described above.

---

## Calendar Service: `createCalendarEvent()` in `calendarService.ts`

```ts
export async function createCalendarEvent(booking: BookingForCalendar): Promise<void> {
  const authClient = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const sessionEnd = new Date(booking.slotTime.getTime() + 60 * 60 * 1000);

  await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `PT Session — ${booking.name}`,
      description: descriptionLines.join('\n'),
      start: { dateTime: booking.slotTime.toISOString() },
      end: { dateTime: sessionEnd.toISOString() },
      attendees: [{ email: booking.email, displayName: booking.name }],
    },
  });
}
```

- **`getAuthenticatedClient()`** — reuses the Phase 2 function that loads and auto-refreshes the OAuth token from the database.
- **`sessionEnd`** — adds 1 hour to the slot start time (all sessions are 1 hour).
- **`attendees`** — adds the client as an attendee, so Google will send them a calendar invite.
- **Scope change** — Phase 2 used `calendar.readonly`. Phase 3 requires `calendar.events` (read + write for events). The `getAuthUrl()` function was updated to request this scope. **The trainer needs to re-run `/auth/google` once** to issue a new token with the broader scope.

---

## Email Service: Booking Emails in `emailService.ts`

Two new functions were added:

### `sendBookingConfirmation(booking)` — to the visitor
Sends a confirmation to the client's email address confirming their session time. All user input (name, etc.) is passed through the existing `escapeHtml()` utility before being rendered into HTML — same pattern as Phase 1.

### `sendBookingNotification(booking)` — to the trainer
Sends a full summary of the booking to the trainer's email (`TRAINER_EMAIL` env var).

### `formatSlotTime(date)`
Formats the `slotTime` Date object into a human-readable string for emails using `toLocaleString()` with the `TRAINER_TIMEZONE` env var. Example output: `"Friday, March 20, 2026 at 6:00 PM"`.

---

## Rate Limiting: `server/index.ts` (SEC-04)

```ts
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

app.use('/api', apiLimiter);
```

This applies to **all `/api/*` routes** — `/api/contact`, `/api/slots`, and `/api/bookings`.

The limit is 20 requests per IP per 15-minute window. A normal visitor making a booking makes about 3–4 requests (fetch slots for 1–2 dates + POST booking), so legitimate users will never hit this. It exists to prevent automated spam/abuse.

`standardHeaders: true` means the rate limit info (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) is returned in response headers, which is helpful for debugging.

---

## Frontend: `src/components/BookingModal.tsx`

The booking modal is a four-step wizard, each step rendered conditionally based on the `step` state variable.

```ts
type Step = 'date' | 'time' | 'form' | 'success';
```

### Step 1: Date picker (`'date'`)

Renders a calendar grid for the currently viewed month.

**How the grid is built:**
```ts
const cells: (number | null)[] = [
  ...Array(firstDayOffset).fill(null), // empty padding cells
  ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
];
```
`firstDayOffset` is what day of the week the 1st of the month falls on (0 = Sunday). We pad with `null` cells to align the grid. Then we fill in day numbers.

The grid is rendered with `grid-cols-7` — 7 columns for 7 days of the week.

Each day button is disabled if it's before today. Past days are greyed out and not clickable.

The "previous month" button is disabled when the user is already viewing the current month — no point navigating to the past.

When a day is clicked, `handleDateSelect(dateStr)` is called:
1. Sets `selectedDate`
2. Advances to the `'time'` step
3. Calls `fetchSlots(dateStr)` to hit `/api/slots?date=YYYY-MM-DD`

### Step 2: Time slot selector (`'time'`)

Shows three possible states:
- **Loading** — spinner while `fetchSlots` is in flight
- **Error** — message + "Try again" link
- **No slots** — message + "Choose a different date" link
- **Slots available** — grid of buttons, one per slot, formatted in the visitor's local time

Each time button calls `handleSlotSelect(slot)` which saves the ISO string and advances to `'form'`.

The "Back" button at the top of steps 2 and 3 lets the user go back without losing already-selected values.

### Step 3: Booking form (`'form'`)

Standard React controlled form — name, email, phone (optional), message (optional).

Displays the selected slot time at the top so the visitor can confirm what they're booking before submitting.

On submit, `handleSubmit` fires a `POST /api/bookings` with the form data + `slotTime`. Handles errors inline (e.g. "This slot has already been booked"). On success, saves `confirmedSlot` and `confirmedEmail` before transitioning to `'success'` — because the form state will be cleared on close but we want to show these on the success screen.

### Step 4: Success screen (`'success'`)

Shows a check icon, the confirmed booking time, and the visitor's email address. Has a "Done" button that closes the modal.

### State reset

A `useEffect` watches `isOpen`. When the modal closes, it resets **all state** after a 300ms delay (to let the close animation finish without showing a flicker of the reset form).

---

## `src/App.tsx` changes

```tsx
const [contactOpen, setContactOpen] = useState(false);
const [bookingOpen, setBookingOpen] = useState(false);
```

Two separate modal states:
- `bookingOpen` is passed to all "Book a Session" CTA buttons throughout the site (Header, Hero, About, Plans sections)
- `contactOpen` remains available for the `ContactModal` (general inquiry form from Phase 1)

Both modals are rendered at the root level so they're accessible from anywhere in the component tree.

---

## Important note for the trainer: re-authorization required

The Google Calendar OAuth scope was updated from `calendar.readonly` to `calendar.events`. The token stored in the database was issued with the old (narrower) scope and **cannot create events**.

The trainer must visit `/auth/google` once after deploying Phase 3 to re-authorize with the new scope. The existing token will be overwritten by the `upsert` in `saveTokensFromCode()` — no data is lost, it just replaces the old token.

---

*Generated: Phase 3 complete — 2026-03-18*
