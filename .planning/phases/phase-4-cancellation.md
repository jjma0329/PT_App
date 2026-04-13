# Phase 4 — Booking Cancellation

## Goal

Allow the trainer to cancel a confirmed booking, which should:
1. Set `status = "cancelled"` in the database
2. Delete the corresponding Google Calendar event
3. (Optional) Send a cancellation email to the client

---

## The Core Problem: We Don't Store the Calendar Event ID

`createCalendarEvent()` currently returns `void`. The Google Calendar API returns an event ID when you create an event (e.g. `"abc123xyz"`), but we throw it away. Without it, cancellation has no way to find and delete the right Google Calendar event.

The fix requires two changes in tandem:
1. Add `googleEventId String?` to the `Booking` schema
2. Change `createCalendarEvent()` to return the event ID, and save it when the booking is created

---

## Schema Change

```prisma
model Booking {
  id             Int      @id @default(autoincrement())
  name           String
  email          String
  phone          String?
  message        String?
  slotTime       DateTime @unique
  status         String   @default("confirmed")
  googleEventId  String?  // null if calendar event creation failed (non-fatal)
  createdAt      DateTime @default(now())
}
```

- `String?` — nullable. If `createCalendarEvent()` failed (non-fatal), there's no event to delete.
- New migration needed: `npx prisma migrate dev --name add_google_event_id`

---

## calendarService.ts Changes

`createCalendarEvent` signature changes from returning `void` to returning the event ID:

```ts
// Before
export async function createCalendarEvent(booking: BookingForCalendar): Promise<void>

// After
export async function createCalendarEvent(booking: BookingForCalendar): Promise<string | null>
```

The Google `events.insert` response contains `data.id` — that's the event ID to store.

Add a `deleteCalendarEvent(eventId: string)` function:

```ts
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const authClient = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  await calendar.events.delete({ calendarId: 'primary', eventId });
}
```

---

## bookingController.ts Changes

**Update `createBooking`** to save the returned event ID:

```ts
// Stage 4: now returns event ID (or null on failure)
let googleEventId: string | null = null;
try {
  googleEventId = await createCalendarEvent(booking);
} catch (calErr) {
  console.error('Google Calendar event creation failed:', calErr);
}

// Save event ID to the booking record
if (googleEventId) {
  await prisma.booking.update({
    where: { id: booking.id },
    data: { googleEventId },
  });
}
```

**Add `cancelBooking`** handler:

```ts
// PATCH /api/bookings/:id/cancel
export async function cancelBooking(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid booking ID.' });
    return;
  }

  try {
    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found.' });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(409).json({ success: false, error: 'Booking is already cancelled.' });
      return;
    }

    // Update status to cancelled
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Delete calendar event — non-fatal
    if (booking.googleEventId) {
      try {
        await deleteCalendarEvent(booking.googleEventId);
      } catch (calErr) {
        console.error('Google Calendar event deletion failed:', calErr);
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('cancelBooking error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel booking.' });
  }
}
```

---

## Route Change

```ts
// Protected by requireApiKey — trainer use only
router.patch('/:id/cancel', requireApiKey, cancelBooking);
```

Using `PATCH` (not `DELETE`) because we're not removing the record — we're changing its status. `DELETE` would imply removing the row. The booking history is worth keeping.

Using `/:id/cancel` (not `/:id` with a body) because it makes the intent unambiguous in a URL — there's no accidental cancellation from a generic PATCH with the wrong body.

---

## What We're NOT Doing (and Why)

| Skipped | Reason |
|---|---|
| Client-facing cancel flow | The trainer controls cancellations. No self-serve cancel UI. |
| Undo / restore cancelled bookings | Out of scope — trainer can re-create manually |
| Cancellation email to client | Reasonable addition, but it's emailService work on top of the core cancel — treat as a follow-on task |
| Soft-delete (separate cancelled table) | Unnecessary complexity — a `status` field is enough |

---

## Implementation Order

1. Schema change + migration (`googleEventId` field)
2. Update `createCalendarEvent()` return type → save event ID in `createBooking`
3. Add `deleteCalendarEvent()` to `calendarService.ts`
4. Add `cancelBooking` controller
5. Add `PATCH /:id/cancel` route (protected)
6. Update `docs/code-walkthrough-phase3-booking.md` with the new pieces

---

## Decision: Email Behavior on Cancellation

- **Client:** No cancellation email — trainer notifies them directly
- **Trainer:** Receives a cancellation notification email (same pattern as `sendBookingNotification`)
