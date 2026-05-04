# Test Plan — JJM Fitness Full Flow

**Scope:** End-to-end manual verification of all 7 phases  
**Environment:** Local dev (`npm run dev` + `npm run server` running concurrently)  
**Base URLs:** Frontend `http://localhost:5173` · API `http://localhost:3001`  
**Prerequisite env vars:** `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `TRAINER_EMAIL`, `TRAINER_TIMEZONE`, `RESEND_API`, `ALLOWED_ORIGIN`, `OAUTH_CLIENT`, `OAUTH_SECRET`, `OAUTH_REDIRECT_URI`, `DATABASE_URL`

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Pass |
| ❌ | Fail |
| ⏭ | Skipped / not applicable |
| ⚠️ | Partial / needs follow-up |

**Cron tests** require either waiting for the hourly tick or triggering the function manually (see Section 8).

---

## Section 1 — Landing Page & Public UI

### TC-01 Cold start
**Steps:**
1. Kill any running server/client processes
2. Run `npm run dev` and `npm run server` in separate terminals
3. Navigate to `http://localhost:5173`

**Expected:** Page loads with no console errors. All sections visible: hero, services, about, plans, reviews, footer.

**Result:** [ ]

---

### TC-02 Responsive layout
**Steps:**
1. Open DevTools → toggle device toolbar
2. Test at 375px (mobile) and 1280px (desktop)

**Expected:** All sections reflow correctly at both widths. No horizontal scroll. Navigation links and CTA buttons are tappable size on mobile.

**Result:** [ ]

---

### TC-03 Dark aesthetic baseline
**Steps:**
1. Review each section visually

**Expected:** Dark background throughout. Yellow accent (`#facc15`) used for headings and CTAs. High-contrast white body text.

**Result:** [ ]

---

## Section 2 — Contact Form

### TC-04 Valid contact submission
**Steps:**
1. Open the contact modal (via any CTA that triggers it)
2. Fill in all fields with valid data
3. Submit

**Expected:** Success message shown. No error banner. Network tab shows `POST /api/contact` returning `{ success: true }`. Trainer receives notification email at `TRAINER_EMAIL`.

**Result:** [ ]

---

### TC-05 Contact form — missing required field
**Steps:**
1. Open contact modal
2. Leave email blank, fill in everything else
3. Submit

**Expected:** Inline validation error. Request is not sent (or server returns 400). Form stays open.

**Result:** [ ]

---

## Section 3 — Google Calendar OAuth Setup

### TC-06 OAuth authorization flow
**Precondition:** OAuth credentials configured in `.env`. Trainer has not yet authorized (or token was manually deleted from DB).

**Steps:**
1. Visit `http://localhost:3001/auth/google` (or whichever setup URL is configured)
2. Complete the Google consent screen
3. Confirm redirect back to the app with no error

**Expected:** Trainer is redirected to the callback URL. DB `OAuthToken` table contains a row with `provider = 'google'` and a non-null `refreshToken`.

**Result:** [ ]

---

### TC-07 Token persists across server restart
**Steps:**
1. After TC-06, stop and restart `npm run server`
2. Make a `GET /api/slots?date=<future-weekday-date>` request

**Expected:** Slots are returned without a 401 or "No OAuth token found" error. Server did not require re-authorization.

**Result:** [ ]

---

## Section 4 — Slot Availability

### TC-08 Slots returned for a valid future date
**Steps:**
1. Pick a weekday at least 48 hours from now, format as `YYYY-MM-DD`
2. `GET /api/slots?date=<date>`

**Expected:** Response `{ success: true, data: ["<ISO>", ...] }`. Times fall within working hours (6 PM–10 PM for weekdays). No slot is within 48 hours of now.

**Result:** [ ]

---

### TC-09 Slots for a weekend date
**Steps:**
1. Pick a Saturday or Sunday at least 48h from now
2. `GET /api/slots?date=<date>`

**Expected:** Returned times fall within weekend working hours (4 PM–8 PM).

**Result:** [ ]

---

### TC-10 Slots for a date within 48 hours
**Steps:**
1. Use today's date or tomorrow
2. `GET /api/slots?date=<today>`

**Expected:** Empty array `[]` or array containing only slots beyond the 48h cutoff.

**Result:** [ ]

---

### TC-11 Booked slot removed from available list
**Precondition:** A confirmed booking exists for a specific slot on a future date.

**Steps:**
1. `GET /api/slots?date=<date-of-existing-booking>`

**Expected:** The booked slot's ISO string is absent from the response array.

**Result:** [ ]

---

## Section 5 — Booking Flow (Public)

### TC-12 Full booking happy path
**Steps:**
1. Click any "Book a session" CTA on the landing page
2. Step 1 — select a date on the calendar picker (>48h out)
3. Step 2 — select an available time slot
4. Step 3 — fill in name, email, phone (optional), message (optional)
5. Submit

**Expected:**
- Step 4 (success screen) shown with confirmation message
- `POST /api/bookings` returns 201
- Booking confirmation email arrives at the submitted email address
- Trainer notification email arrives at `TRAINER_EMAIL`
- New event appears in trainer's Google Calendar at the correct time
- `GET /api/bookings` (with auth) shows the new booking with `status: 'confirmed'`

**Result:** [ ]

---

### TC-13 Double-booking protection
**Steps:**
1. Complete TC-12 and note the booked slot time
2. Open a second browser tab, go through the booking flow, select the same slot
3. Submit

**Expected:** Server returns 409 "This time slot has already been booked." Error message shown in UI. No second booking created in DB.

**Result:** [ ]

---

### TC-14 Booking validation — missing required fields
**Steps:**
1. Open booking modal, reach step 3
2. Clear the name field, attempt to submit

**Expected:** Inline error shown. Request not sent (or 400 returned). Form does not advance.

**Result:** [ ]

---

### TC-15 Booking validation — invalid email
**Steps:**
1. In step 3, enter `notanemail` in the email field, submit

**Expected:** 400 response or client-side validation error. Booking not created.

**Result:** [ ]

---

## Section 6 — Trainer Authentication

### TC-16 Login — valid credentials
**Steps:**
1. Navigate to `http://localhost:5173/admin/login`
2. Enter the email matching `ADMIN_EMAIL` and the plaintext password corresponding to `ADMIN_PASSWORD_HASH`
3. Click Sign In

**Expected:** Redirected to `/admin`. Dashboard renders with booking list. `admin_token` key present in `localStorage`.

**Result:** [ ]

---

### TC-17 Login — wrong password
**Steps:**
1. On `/admin/login`, enter correct email, wrong password
2. Submit

**Expected:** Inline error: "Invalid credentials." No redirect. `admin_token` not set.

**Result:** [ ]

---

### TC-18 Login — wrong email
**Steps:**
1. On `/admin/login`, enter wrong email, correct password
2. Submit

**Expected:** Same "Invalid credentials." error. Response time should be similar to TC-17 (constant-time check).

**Result:** [ ]

---

### TC-19 Unauthenticated access to /admin
**Steps:**
1. Open a private/incognito window (no token in localStorage)
2. Navigate directly to `http://localhost:5173/admin`

**Expected:** Immediately redirected to `/admin/login`. Dashboard is never shown.

**Result:** [ ]

---

### TC-20 Expired/tampered token rejected
**Steps:**
1. Log in to get a valid token
2. Open DevTools → Application → Local Storage → manually edit `admin_token` value (corrupt one character)
3. Refresh `/admin`

**Expected:** Redirected to `/admin/login`. API returns 401 when the corrupted token is used.

**Result:** [ ]

---

### TC-21 Logout
**Steps:**
1. Log in to `/admin`
2. Click "Sign out"

**Expected:** Redirected to `/admin/login`. `admin_token` removed from `localStorage`. Navigating back to `/admin` redirects to login again.

**Result:** [ ]

---

## Section 7 — Admin Booking Management

### TC-22 Booking list loads
**Precondition:** At least one booking exists (from TC-12).

**Steps:**
1. Log in to `/admin`

**Expected:** Booking cards visible. Each card shows: client name, formatted slot time (e.g. "Mon, Apr 21, 2026, 6:00 PM"), email, phone (if provided), status badge. Summary stats (Total / Confirmed / Cancelled) show correct counts.

**Result:** [ ]

---

### TC-23 Filter — confirmed
**Steps:**
1. On `/admin`, click the "confirmed" filter tab

**Expected:** Only bookings with `status: confirmed` shown. Confirmed count matches badge.

**Result:** [ ]

---

### TC-24 Filter — cancelled
**Steps:**
1. Click "cancelled" filter tab

**Expected:** Only cancelled bookings shown (or empty state "No cancelled bookings").

**Result:** [ ]

---

### TC-25 Cancel a booking
**Precondition:** At least one confirmed booking exists.

**Steps:**
1. On a confirmed booking card, click "Cancel booking"
2. Inline confirmation appears — click "Yes, cancel"

**Expected:**
- Status badge on the card changes to "cancelled" without a full page reload
- "Cancel booking" and "Reschedule" buttons disappear from that card
- `PATCH /api/bookings/:id/cancel` returns 200
- Google Calendar event for that booking is deleted
- Cancellation notification email arrives at `TRAINER_EMAIL`

**Result:** [ ]

---

### TC-26 Cancel confirmation — dismiss
**Steps:**
1. Click "Cancel booking" on a confirmed card
2. Click "Keep" instead of "Yes, cancel"

**Expected:** Booking status unchanged. Confirmation UI dismissed. Card returns to normal state.

**Result:** [ ]

---

## Section 8 — Rescheduling

### TC-27 Reschedule happy path
**Precondition:** At least one confirmed booking exists. At least one other available slot exists on a different date.

**Steps:**
1. On a confirmed booking card, click "Reschedule"
2. ReschedulePanel expands inline
3. Select a date using the date picker
4. Available time slots appear — select one
5. Click "Confirm reschedule"

**Expected:**
- Booking card updates to show new slot time in place — no full reload
- `PATCH /api/bookings/:id/reschedule` returns 200
- Old Google Calendar event deleted; new event created at new time
- `reminderSentAt` is reset to null in the DB (verify via admin API or DB query if needed)

**Result:** [ ]

---

### TC-28 Reschedule — no slots available on selected date
**Steps:**
1. Open ReschedulePanel
2. Select a date that has no available slots (e.g. a fully booked date, or a date within 48h)

**Expected:** "No available slots for this date." message shown. No slot buttons rendered.

**Result:** [ ]

---

### TC-29 Reschedule — slot taken by another booking
**Precondition:** Two confirmed bookings A and B exist.

**Steps:**
1. Open ReschedulePanel for booking A
2. Select a date and time that matches booking B's slot

**Expected:** `PATCH` returns 409 "That time slot is already booked." Error shown in panel. Booking A's slot unchanged.

**Result:** [ ]

---

### TC-30 Reschedule — cancel button closes panel
**Steps:**
1. Open ReschedulePanel
2. Click "Cancel"

**Expected:** Panel collapses. Booking card returns to normal state. No changes made.

**Result:** [ ]

---

### TC-31 Reschedule — mutually exclusive with cancel confirm
**Steps:**
1. Click "Cancel booking" on a confirmed card (shows inline confirmation)
2. Then click "Reschedule" on the same card

**Expected:** Cancel confirmation UI dismisses. ReschedulePanel opens. Only one action UI visible at a time.

**Result:** [ ]

---

## Section 9 — Cron Jobs (Reminders & Review Requests)

> These jobs run at the top of every hour via `node-cron`. For manual testing, call the service functions directly from a script or test file, or wait for the next :00 tick after seeding the right DB state.

### TC-32 24h reminder — sent once
**Precondition:** A confirmed booking exists with `slotTime` between 23–25 hours from now and `reminderSentAt IS NULL`.

**Steps:**
1. Wait for the next hourly cron tick (or call `sendPendingReminders()` manually)
2. Check the client's inbox

**Expected:**
- Reminder email received with correct session time formatted in `TRAINER_TIMEZONE`
- `reminderSentAt` is now non-null on that booking in the DB

**Result:** [ ]

---

### TC-33 24h reminder — not sent twice
**Precondition:** TC-32 completed. `reminderSentAt` is stamped.

**Steps:**
1. Trigger `sendPendingReminders()` again

**Expected:** No second reminder email sent. Log shows 0 bookings matched.

**Result:** [ ]

---

### TC-34 Reminder reset on reschedule
**Precondition:** A booking has `reminderSentAt` already stamped (reminder was sent).

**Steps:**
1. Reschedule the booking to a new slot (via TC-27)
2. Check the DB: `reminderSentAt` on the booking

**Expected:** `reminderSentAt` is `null`. The next cron run will send a fresh reminder 24h before the new slot.

**Result:** [ ]

---

### TC-35 Review request — sent once, after session ends
**Precondition:** A confirmed booking exists with `slotTime` between 1 hour and 7 days ago, `reviewRequestSentAt IS NULL`.

**Steps:**
1. Trigger `sendPendingReviewRequests()` (or wait for cron tick)
2. Check the client's inbox

**Expected:**
- Review request email received with "Leave a review" CTA button linking to `${ALLOWED_ORIGIN}/review`
- `reviewRequestSentAt` is now non-null on that booking in the DB

**Result:** [ ]

---

### TC-36 Review request — not sent for sessions >7 days ago
**Precondition:** A confirmed booking exists with `slotTime` more than 7 days ago, `reviewRequestSentAt IS NULL`.

**Steps:**
1. Trigger `sendPendingReviewRequests()`

**Expected:** No review request email sent for that booking. It falls outside the 7-day window.

**Result:** [ ]

---

### TC-37 Review request — not sent for cancelled bookings
**Precondition:** A cancelled booking exists with `slotTime` 2 hours ago, `reviewRequestSentAt IS NULL`.

**Steps:**
1. Trigger `sendPendingReviewRequests()`

**Expected:** No review request email sent. Status filter excludes cancelled bookings.

**Result:** [ ]

---

## Section 10 — Testimonial Submission (Public)

### TC-38 Navigate to /review
**Steps:**
1. Navigate to `http://localhost:5173/review`

**Expected:** Page renders. Name field, star rating (5 stars, interactive), message textarea, and submit button all visible. No auth required.

**Result:** [ ]

---

### TC-39 Star rating — hover interaction
**Steps:**
1. On `/review`, hover over star 3

**Expected:** Stars 1–3 fill yellow. Stars 4–5 remain outline. On mouse leave, stars return to previously selected state (or all outline if none selected).

**Result:** [ ]

---

### TC-40 Valid testimonial submission
**Steps:**
1. Fill in name, click star 5, write a message
2. Click "Submit review"

**Expected:**
- Success state shown: "Thank you! Your review has been submitted and will appear on the site once approved."
- `POST /api/testimonials` returns 201
- DB `Testimonial` table has a new row with `approved: false`
- Form is replaced by the success message (not just cleared)

**Result:** [ ]

---

### TC-41 Submission — missing name
**Steps:**
1. Leave name blank, select rating, fill message, submit

**Expected:** 400 response. Error shown in form. Testimonial not created.

**Result:** [ ]

---

### TC-42 Submission — invalid rating (0 stars)
**Steps:**
1. Fill name and message, do not click any star, submit

**Expected:** Client-side validation fires: "Please select a star rating." No request sent (or 400 if request is sent). Testimonial not created.

**Result:** [ ]

---

### TC-43 Submission — missing message
**Steps:**
1. Fill name, select rating, leave message blank, submit

**Expected:** 400 response. Error shown. Testimonial not created.

**Result:** [ ]

---

## Section 11 — Testimonial Approval (Admin)

### TC-44 Testimonials tab loads
**Precondition:** At least one testimonial submitted (TC-40). Logged in to `/admin`.

**Steps:**
1. Click the "testimonials" tab in the admin header

**Expected:**
- Testimonials list loads
- The tab fetches on first click, not on initial page load
- Submitted testimonial appears with name, stars, message, and "pending" badge
- "Approve" button visible on the pending card

**Result:** [ ]

---

### TC-45 Pending badge count
**Precondition:** One or more unapproved testimonials exist.

**Steps:**
1. View the admin page on the "bookings" tab (default view)

**Expected:** Red badge with the pending count appears on the "testimonials" tab button, visible without switching tabs.

**Result:** [ ]

---

### TC-46 Approve a testimonial
**Steps:**
1. On the testimonials tab, click "Approve" on a pending testimonial

**Expected:**
- Status badge changes from "pending" to "approved" in place — no reload
- "Approve" button disappears from that card
- `PATCH /api/testimonials/:id/approve` returns 200
- DB row now has `approved: true`

**Result:** [ ]

---

### TC-47 Approve — idempotency
**Steps:**
1. Attempt to call `PATCH /api/testimonials/:id/approve` on an already-approved testimonial (via curl or DevTools)

**Expected:** 409 "Testimonial is already approved."

**Result:** [ ]

---

### TC-48 Unapproved testimonials not visible publicly
**Precondition:** A testimonial exists with `approved: false`.

**Steps:**
1. `GET /api/testimonials/approved`

**Expected:** That testimonial is absent from the response. Only `approved: true` records returned.

**Result:** [ ]

---

## Section 12 — Testimonials on Landing Page

### TC-49 TestimonialsSection hidden when empty
**Precondition:** No approved testimonials in DB.

**Steps:**
1. Navigate to `http://localhost:5173`

**Expected:** No "What Clients Say" section visible in the page DOM. `GET /api/testimonials/approved` is called but returns `[]`.

**Result:** [ ]

---

### TC-50 TestimonialsSection visible after first approval
**Precondition:** TC-46 completed — at least one testimonial approved.

**Steps:**
1. Navigate to (or reload) `http://localhost:5173`
2. Scroll down past the existing ReviewsSection

**Expected:**
- "What Clients Say" section renders
- Approved testimonial card shows: initial-avatar circle, name, filled star rating, message in quotes
- No broken images or layout issues

**Result:** [ ]

---

### TC-51 Approved testimonials only — no pending leaked
**Precondition:** Mix of approved and pending testimonials in DB.

**Steps:**
1. Inspect the network request to `GET /api/testimonials/approved` on the landing page
2. Count testimonial cards rendered on screen

**Expected:** Card count matches the approved-only count. Pending testimonials do not appear.

**Result:** [ ]

---

## Section 13 — API Security

### TC-52 Unauthenticated GET /api/bookings returns 401
**Steps:**
1. `GET http://localhost:3001/api/bookings` (no Authorization header)

**Expected:** 401 `{ success: false, error: "Unauthorized." }`

**Result:** [ ]

---

### TC-53 Unauthenticated PATCH /api/bookings/:id/cancel returns 401
**Steps:**
1. `PATCH http://localhost:3001/api/bookings/1/cancel` (no auth)

**Expected:** 401

**Result:** [ ]

---

### TC-54 Unauthenticated PATCH /api/bookings/:id/reschedule returns 401
**Steps:**
1. `PATCH http://localhost:3001/api/bookings/1/reschedule` with body `{ "newSlotTime": "..." }` (no auth)

**Expected:** 401

**Result:** [ ]

---

### TC-55 Unauthenticated GET /api/testimonials returns 401
**Steps:**
1. `GET http://localhost:3001/api/testimonials` (no auth)

**Expected:** 401. The public `/approved` endpoint is not affected — it has no auth.

**Result:** [ ]

---

### TC-56 Rate limiting on API routes
**Steps:**
1. Send more than 20 requests to any `/api/*` endpoint within 15 minutes from the same IP

**Expected:** 429 response with `{ success: false, error: "Too many requests. Please try again later." }`

**Result:** [ ]

---

## Section 14 — Edge Cases & Data Integrity

### TC-57 Cancel already-cancelled booking
**Steps:**
1. `PATCH /api/bookings/:id/cancel` on a booking already in `cancelled` status (with valid JWT)

**Expected:** 409 "Booking is already cancelled."

**Result:** [ ]

---

### TC-58 Reschedule a cancelled booking
**Steps:**
1. `PATCH /api/bookings/:id/reschedule` on a cancelled booking (with valid JWT)

**Expected:** 409 "Cannot reschedule a cancelled booking."

**Result:** [ ]

---

### TC-59 Reschedule to same slot
**Steps:**
1. `PATCH /api/bookings/:id/reschedule` with `newSlotTime` equal to the booking's current `slotTime`

**Expected:** 409 "New slot is the same as the current slot."

**Result:** [ ]

---

### TC-60 Booking a slot that was just freed by a cancellation
**Precondition:** Slot X was previously booked then cancelled.

**Steps:**
1. Open booking modal, navigate to the date of the cancelled slot
2. `GET /api/slots?date=<date>` — confirm slot X appears as available
3. Book slot X

**Expected:** Booking succeeds. Cancelled bookings do not block availability.

**Result:** [ ]

---

## Summary

| Section | Total | Pass | Fail | Skipped |
|---------|-------|------|------|---------|
| 1. Landing Page | 3 | | | |
| 2. Contact Form | 2 | | | |
| 3. OAuth Setup | 2 | | | |
| 4. Slot Availability | 4 | | | |
| 5. Booking Flow | 4 | | | |
| 6. Trainer Auth | 6 | | | |
| 7. Admin Booking Mgmt | 5 | | | |
| 8. Rescheduling | 5 | | | |
| 9. Cron Jobs | 6 | | | |
| 10. Testimonial Submission | 6 | | | |
| 11. Testimonial Approval | 5 | | | |
| 12. Testimonials on Landing | 3 | | | |
| 13. API Security | 5 | | | |
| 14. Edge Cases | 4 | | | |
| **Total** | **60** | | | |

---

## Notes for Tester

**Cron jobs (TC-32–TC-37):** The easiest way to test these without waiting for an hourly tick is to add a temporary test route or call the service functions from a Node REPL:

```bash
node --input-type=module <<'EOF'
import { sendPendingReminders } from './server/services/reminderService.ts';
import { sendPendingReviewRequests } from './server/services/reviewRequestService.ts';
await sendPendingReminders();
await sendPendingReviewRequests();
EOF
```

Or seed the DB with a booking at the right timestamp and wait for the next `:00` tick.

**Checking `reminderSentAt` / `reviewRequestSentAt` in the DB:** Use `psql` or a DB GUI (TablePlus, DBeaver) to inspect the `Booking` table directly after cron tests.

**TC-56 (rate limiting):** Use a short shell loop:
```bash
for i in {1..22}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/slots?date=2099-01-01; done
```
The 21st+ request should return `429`.
