# Code Walkthrough — Phase 6: Rescheduling

**Audience:** Someone who knows Python well and is learning TypeScript/React at a beginner–intermediate level.

---

## What Phase 6 Built

A trainer-only rescheduling flow built on top of the existing admin UI. For any confirmed booking, the trainer can pick a new date, see available time slots, and confirm the reschedule — all from the admin dashboard. Behind the scenes: the DB record is updated, the old Google Calendar event is deleted, a new one is created, and the 24h reminder is reset so it fires again for the new time.

---

## Topology

```
AdminPage.tsx
└── Booking card (confirmed)
    ├── "Cancel booking" button  (Phase 4 — unchanged)
    └── "Reschedule" button  ← NEW
        └── ReschedulePanel.tsx  (inline, expands in-card)
            │
            │  GET /api/slots?date=YYYY-MM-DD  (public, existing)
            │  PATCH /api/bookings/:id/reschedule  ← NEW
            ▼
Express Server
└── server/routes/bookings.ts           ← new route registered
    └── requireJwt middleware
        └── bookingController.ts        ← rescheduleBooking() added
            ├── prisma.booking.findUnique   (load the booking)
            ├── prisma.booking.findFirst    (conflict check)
            ├── prisma.booking.update       (slotTime + reminderSentAt = null)
            ├── deleteCalendarEvent()       (remove old event)
            └── createCalendarEvent()       (create new event)
```

---

## Files Changed or Created

### `server/routes/bookings.ts`

One new line:

```ts
router.patch('/:id/reschedule', requireJwt, rescheduleBooking);
```

Pattern is identical to `/:id/cancel` — `requireJwt` guards the route so only an authenticated trainer can call it.

---

### `server/controllers/bookingController.ts` — `rescheduleBooking()`

#### Validation

Same pattern as `createBooking` and `cancelBooking`:
- Parse `:id` as an integer, reject non-numeric with 400
- Require `newSlotTime` in the request body, reject missing/invalid with 400

#### Guards before writing

```ts
if (booking.status === 'cancelled') → 409
if (booking.slotTime === newSlotDate) → 409  // same-slot no-op
```

The same-slot check prevents a trainer from accidentally "rescheduling" to the same time and triggering a pointless calendar event swap.

#### Conflict check

```ts
const conflict = await prisma.booking.findFirst({
  where: {
    slotTime: newSlotDate,
    id: { not: id },           // exclude the current booking
    status: { not: 'cancelled' }, // cancelled bookings don't hold a slot
  },
});
```

This is slightly more nuanced than the `createBooking` check, which just does `findUnique`. Here we need `findFirst` with extra filters because:
1. We need to exclude the current booking's own ID (though in practice the current booking won't be at `newSlotDate` since we checked that above)
2. Cancelled bookings don't occupy a slot — their `slotTime` value is kept in the DB for history, so we explicitly skip them

#### The update — why both sentinel fields must be reset

```ts
await prisma.booking.update({
  where: { id },
  data: {
    slotTime:            newSlotDate,
    reminderSentAt:      null,   // ← so reminder fires again for the new slot
    reviewRequestSentAt: null,   // ← so review request fires after the new session
  },
});
```

**`reminderSentAt: null`:**
If the reminder was already sent for the old slot, `reminderSentAt` holds a past timestamp. The reminder cron's `null` filter would skip it — leaving the rescheduled booking without a reminder. Resetting to `null` ensures the cron picks it up and sends a fresh reminder 24h before the new slot.

**`reviewRequestSentAt: null`:**
Same logic applies to the review request. If a session was rescheduled after the review request had already been sent (or the old session date had already passed), `reviewRequestSentAt` would hold a non-null timestamp. The review request cron looks for `reviewRequestSentAt: null` — without this reset, the rescheduled booking's new session would end and no review email would ever be sent.

#### Calendar event swap

```ts
// Delete old event — non-fatal
if (booking.googleEventId) {
  await deleteCalendarEvent(booking.googleEventId);
}

// Create new event — non-fatal
const newGoogleEventId = await createCalendarEvent({ ...updated });
if (newGoogleEventId) {
  await prisma.booking.update({ where: { id }, data: { googleEventId: newGoogleEventId } });
}
```

Same non-fatal pattern as `cancelBooking` and `createBooking`: the DB update already succeeded, so a calendar failure doesn't roll anything back. Each step is in its own try/catch.

#### Race condition safety

The `prisma.booking.update` writes to a `@unique` column (`slotTime`). If two reschedule requests land simultaneously for the same new slot, one will throw a P2002 Prisma error. The existing `isPrismaUniqueError` helper catches this and returns a 409.

---

### `src/components/ReschedulePanel.tsx`

An inline component that renders inside the booking card when the trainer clicks "Reschedule."

**Props:**
- `booking` — the current booking (needs `id` and current `slotTime`)
- `onSuccess(updatedBooking)` — called with the API response when reschedule succeeds; parent swaps the booking in state
- `onClose` — called when the trainer clicks "Cancel" or when the panel should close

**Flow:**
1. Trainer picks a date via `<input type="date">`
2. `useEffect` fires on `selectedDate` change → fetches `/api/slots?date=YYYY-MM-DD` (no auth required — it's the public slots endpoint)
3. Available slots render as buttons; clicking one sets `selectedSlot`
4. "Confirm reschedule" calls `PATCH /api/bookings/:id/reschedule` with `{ newSlotTime: selectedSlot }`
5. On success, `onSuccess` is called and the panel closes

**Why a separate component and not inline JSX in `AdminPage.tsx`?**

The panel has its own state machine (date, slots, loading, errors, selected slot, submitting). Putting all of that inside `AdminPage.tsx` would create ~6 extra state variables that only exist for the active reschedule, cluttering the parent. A component boundary keeps each piece of state local to where it's used.

---

### `src/pages/admin/AdminPage.tsx`

Three additions:

1. `import { ReschedulePanel }` at the top

2. New state variable:
   ```ts
   const [reschedulingId, setReschedulingId] = useState<number | null>(null);
   ```
   Tracks which booking card has its reschedule panel open. Same pattern as `confirmingId` for the cancel flow.

3. `handleRescheduleSuccess`:
   ```ts
   const handleRescheduleSuccess = (updated: Booking) => {
     setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));
     setReschedulingId(null);
   };
   ```
   Swaps the updated booking in the list in-place — same approach as `handleCancel`. No full re-fetch needed.

**UX detail:** clicking "Cancel booking" while the reschedule panel is open closes the panel (sets `reschedulingId` to null), and vice versa. Only one action UI is visible at a time per card.

---

## What Was Not Changed

- The slots API (`/api/slots`) — reused as-is; it's already public and returns the right shape
- `reminderService.ts` — the `reminderSentAt: null` reset in the controller is the only integration needed; the cron job picks it up automatically on the next tick
- `emailService.ts` — no rescheduling-specific email was added; the cancellation handler in `bookingController.ts` now also emails the client (`sendClientCancellationEmail`) but that was a separate fix, not part of the reschedule flow
- `calendarService.ts` — `createCalendarEvent` and `deleteCalendarEvent` were already exported; no changes needed
