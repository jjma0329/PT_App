# Code Walkthrough — Phase 5: Booking Reminders

**Audience:** Someone who knows Python well and is learning TypeScript/Node.js at a beginner–intermediate level.

---

## What Phase 5 Built

An automated reminder system that runs in the background on the server. Once an hour, the server finds all confirmed bookings coming up within a 23–25 hour window and sends the client a reminder email. No trainer action required — it just runs.

---

## Topology

```
server/index.ts                  ← server entry point; starts the cron job on boot
└── node-cron (0 * * * *)        ← fires at the top of every hour
    └── sendPendingReminders()   ← core reminder logic
        ├── prisma.booking.findMany(...)   ← query: confirmed + 23–25h window + no reminderSentAt
        ├── sendBookingReminder()          ← Resend email to the client
        └── prisma.booking.update(...)     ← stamp reminderSentAt to prevent double-send

prisma/schema.prisma             ← Booking model gained reminderSentAt DateTime?
prisma/migrations/               ← SQL migration added the column to the live DB
server/services/reminderService.ts  ← cron logic lives here
server/services/emailService.ts     ← sendBookingReminder() added here
```

---

## Files Changed or Created

### `prisma/schema.prisma` — new field on `Booking`

```prisma
reminderSentAt  DateTime?
```

This is a nullable datetime. `null` means "reminder not yet sent." Once the reminder fires, the timestamp of when it was sent is stored here. This is the idempotency guard — the cron query filters `reminderSentAt: null` so the same booking can never be reminded twice.

---

### Migration SQL

The migration (`20260416133844_add_reminder_sent_at`) adds one nullable column:

```sql
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
```

Nullable, so all existing rows get `NULL` by default — no backfill needed.

---

### `server/services/reminderService.ts` — the core logic

This file exports one function: `sendPendingReminders()`.

#### How it computes the window

```
now
├── + 23 hours → windowStart
└── + 25 hours → windowEnd
```

Any booking whose `slotTime` falls in that 2-hour band gets a reminder. Using a 2-hour window instead of exactly 24h gives the hourly cron job a safety margin — even if a cron tick fires a few minutes late, no booking slips through.

#### The DB query

```ts
await prisma.booking.findMany({
  where: {
    status: 'confirmed',
    slotTime: { gte: windowStart, lte: windowEnd },
    reminderSentAt: null,
  },
});
```

Three conditions must all be true:
- `status: 'confirmed'` — cancelled bookings don't get reminders
- `slotTime` in the 23–25h window — only "coming up tomorrow"
- `reminderSentAt: null` — hasn't been reminded yet

#### The send-then-stamp pattern

```ts
await sendBookingReminder(booking);       // 1. send email
await prisma.booking.update({             // 2. stamp the record
  where: { id: booking.id },
  data:  { reminderSentAt: new Date() },
});
```

Order matters: the email is sent first, then the DB is updated. If the DB update fails (rare), the next cron run will attempt to re-send — a minor duplicate is better than silently skipping the reminder. If the email send fails, `reminderSentAt` is never stamped, so the next run will try again.

Each booking is processed in a `try/catch` so one failure doesn't block the rest of the batch.

**Why send first, then stamp?** The order is deliberate:

```
Correct order (send → stamp):
  Cron tick 1:  send email ✓ → stamp reminderSentAt ✓  →  done
  Cron tick 2:  reminderSentAt is set → query skips it  →  no duplicate

  If email send fails:
  Cron tick 1:  send fails (exception thrown) → stamp never runs
  Cron tick 2:  reminderSentAt is still null → tries again ✓

Wrong order (stamp → send):
  Cron tick 1:  stamp reminderSentAt ✓ → send email fails ✗
  Cron tick 2:  reminderSentAt is set → query skips it
  → Client never gets their reminder, and the system thinks it was sent!
```

"Send first" ensures a failed email is retried. "Stamp first" would silently lose reminders.

---

### `server/services/emailService.ts` — `sendBookingReminder()`

Added a new exported function alongside the existing confirmation and notification emails. It reuses the same `formatSlotTime()` helper (respects `TRAINER_TIMEZONE` env var) and the same `escapeHtml()` safety function.

Subject line: `Reminder: your session is tomorrow — <formatted time>`

---

### `server/index.ts` — cron registration

```ts
import cron from 'node-cron';
import { sendPendingReminders } from './services/reminderService.ts';

cron.schedule('0 * * * *', async () => {
  await sendPendingReminders();
});
```

`'0 * * * *'` is standard cron syntax: "at minute 0 of every hour." `node-cron` aligns to wall-clock time, so the job fires at 9:00, 10:00, 11:00, etc. — not 9:37, 10:37 (which is what `setInterval` would do if the server starts at :37).

The cron job is skipped when `NODE_ENV === 'test'` to prevent side effects during the test suite.

**Why is the cron in `index.ts` and not `app.ts`?**

`app.ts` exports the Express app object — it's imported by tests, other modules, and the server entry point. If the cron job lived there, it would start running every time any file imports `app`. A test importing `app` would accidentally kick off background jobs and send real emails.

`index.ts` is the entry point — it's only ever executed when you actually start the server with `npm run server`. Nothing imports it. So the cron job is safely isolated here.

---

## Why `node-cron` and not `setInterval`

`setInterval(fn, 60 * 60 * 1000)` starts counting from the moment the server boots. If the server starts at 9:43 AM, the job runs at 10:43 AM, 11:43 AM, etc. That's unpredictable in production and hard to reason about when debugging.

`node-cron` runs on wall-clock schedule (`0 * * * *` = top of every hour). Predictable, monitorable, and consistent across server restarts.

---

## Environment Variables Used

| Variable | Purpose |
|---|---|
| `TRAINER_TIMEZONE` | Formats the reminder email's session time in the correct timezone (e.g. `America/New_York`) |
| `RESEND_API` | Resend API key for sending emails (already in use from Phase 3) |
