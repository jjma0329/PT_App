# Code Walkthrough — Phase 7: Testimonials

**Audience:** Someone who knows Python well and is learning TypeScript/React at a beginner–intermediate level.

---

## What Phase 7 Built

A full testimonial lifecycle:
1. After a session ends, the client automatically receives a review request email with a link to `/review`
2. The client fills in name, star rating (1–5), and a message — submitted to the public API
3. The trainer sees pending testimonials in the admin UI and approves them
4. Approved testimonials appear dynamically on the public landing page

---

## Testimonial Lifecycle

```
1. Session ends (slotTime <= now - 1h)
        ↓
2. Hourly cron finds booking: reviewRequestSentAt IS NULL
        ↓
3. sendReviewRequest() → email to client with link to /review
        ↓
4. DB stamps: reviewRequestSentAt = now  (never emailed again)
        ↓
5. Client visits /review, submits name + rating + message
        ↓
6. POST /api/testimonials → DB: Testimonial { approved: false }
        ↓
7. Trainer logs into /admin → Testimonials tab (pending badge shown)
        ↓
8. Trainer clicks "Approve" → PATCH /api/testimonials/:id/approve
        ↓
9. DB: Testimonial { approved: true }
        ↓
10. GET /api/testimonials/approved → TestimonialsSection renders it on landing page
```

---

## Topology

```
Hourly cron (server/index.ts)
├── sendPendingReminders()           ← Phase 5 (unchanged)
└── sendPendingReviewRequests()      ← NEW
    ├── prisma.booking.findMany(...)     (slotTime <= now-1h, >= now-7d, reviewRequestSentAt null)
    ├── sendReviewRequest()              ← email with link to /review
    └── prisma.booking.update(...)       (stamp reviewRequestSentAt)

Public routes (/api/testimonials)
├── GET  /approved         → getApprovedTestimonials  (landing page)
├── POST /                 → createTestimonial         (client submits)
├── GET  /                 → getTestimonials           (admin, all)
└── PATCH /:id/approve     → approveTestimonial        (admin)

Frontend
├── /review                → ReviewPage.tsx        (public submission form)
├── Landing page           → TestimonialsSection   (fetches /approved, hidden if empty)
└── /admin → Testimonials tab → AdminPage.tsx      (approve queue)
```

---

## Files Changed or Created

### `prisma/schema.prisma` — two additions

**New field on `Booking`:**
```prisma
reviewRequestSentAt  DateTime?
```
Same idempotency pattern as `reminderSentAt` — `null` means the review request hasn't been sent yet. Stamped after a successful send so the cron never emails the same client twice.

**New model:**
```prisma
model Testimonial {
  id        Int      @id @default(autoincrement())
  name      String
  rating    Int
  message   String
  approved  Boolean  @default(false)
  createdAt DateTime @default(now())
}
```
`approved` defaults to `false` — all submissions are in a pending queue until the trainer explicitly approves them.

---

### `server/services/reviewRequestService.ts`

Same structure as `reminderService.ts`. The window query:

```ts
slotTime: {
  lte: now - 1h,   // session has already ended
  gte: now - 7d,   // but not too far in the past
}
reviewRequestSentAt: null
```

**Why the 7-day upper bound?** Without it, if the server deploys for the first time or comes back online after an outage, it would retroactively email clients for all past sessions that don't have `reviewRequestSentAt` set. The 7-day cap limits the blast radius to the recent past.

---

### `server/services/emailService.ts` — `sendReviewRequest()`

Uses `process.env.ALLOWED_ORIGIN` to build the review link dynamically:

```ts
const siteUrl = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';
// → link in email: ${siteUrl}/review
```

This means the same code works in dev (`localhost:5173`) and production (your real domain) without any changes — just set `ALLOWED_ORIGIN` correctly in each environment's `.env`.

---

### `server/index.ts` — cron updated

```ts
cron.schedule('0 * * * *', async () => {
  await sendPendingReminders();
  await sendPendingReviewRequests();  // ← added
});
```

Both jobs run in the same tick. They're independent — a failure in one doesn't block the other because each has its own try/catch at the per-booking level.

---

### `server/controllers/testimonialController.ts` — 4 functions

**`createTestimonial` (public POST)**

Validates all three required fields:
- `name` — must be non-empty string, max 100 characters
- `message` — must be non-empty string, max 2000 characters
- `rating` — must be an integer between 1 and 5 (checked with `Number.isInteger` and range bounds)

Length limits prevent oversized submissions from being stored and potentially forwarded to email alerts or rendered in the UI without bounds. The same 100/2000 limits are applied consistently across the booking and contact controllers.

Saves with `approved: false` — trainer approval required before it goes public.

**`getApprovedTestimonials` (public GET /approved)**

Returns only `approved: true` records, ordered oldest-first. Oldest-first keeps the display order stable across page loads (unlike `desc`, which would reorder every time a new one is approved).

**`getTestimonials` (admin GET /)**

Returns all records for the admin view, sorted pending-first then newest-first within each group:
```ts
orderBy: [{ approved: 'asc' }, { createdAt: 'desc' }]
```
`false` sorts before `true` in ascending order, so pending items appear at the top of the list.

**`approveTestimonial` (admin PATCH /:id/approve)**

Standard load-check-update pattern: find the testimonial, 404 if missing, 409 if already approved, then flip `approved: true`.

---

### `server/routes/testimonials.ts` — route ordering matters

```ts
router.get('/approved', getApprovedTestimonials);   // ← must come first
router.get('/',         requireJwt, getTestimonials);
router.post('/',        createTestimonial);
router.patch('/:id/approve', requireJwt, approveTestimonial);
```

`GET /approved` is registered before `GET /:id` (if it existed) to prevent Express parsing the literal string "approved" as a dynamic `:id` parameter. This is a common Express gotcha — literal routes always need to be registered before parameterized ones.

---

### `src/pages/ReviewPage.tsx`

A standalone public page at `/review`. No auth required.

**Star rating interaction:** Uses mouse hover state (`hovered`) separate from the committed selection (`rating`) so the stars animate on hover before a selection is locked in:

```ts
const displayRating = hovered || rating;
// → while hovering star 3, shows 3 filled; on click, rating = 3; on mouse leave, hovered = 0
```

`<i className={`bx ${star <= displayRating ? 'bxs-star' : 'bx-star'}`} />` — toggles between filled (`bxs-star`) and outline (`bx-star`) icons from Boxicons, which is already loaded in `index.html`.

After a successful submission, the form is replaced with a success confirmation. The record is pending — the page doesn't tell the user when it will be published (since that depends on trainer approval).

---

### `src/components/TestimonialsSection.tsx`

Fetches `/api/testimonials/approved` on mount. The component tracks both the testimonials array and a `loadError` flag:

```ts
const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
const [loadError, setLoadError] = useState(false);

useEffect(() => {
  (async () => {
    try {
      const res = await fetch('/api/testimonials/approved');
      if (!res.ok) { setLoadError(true); return; }
      const json = await res.json();
      if (json.success) {
        setTestimonials(json.data ?? []);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
  })();
}, []);

if (loadError || testimonials.length === 0) return null;
```

**Error tracking:** Previously, the catch block was empty and `fetch` errors were silently swallowed. Now the `loadError` flag is set in all failure cases: network errors, non-2xx responses, and `success: false` API responses. The section still returns `null` on error (a broken testimonials section shouldn't disrupt the landing page), but the error state is properly tracked and available for future use.

**Empty state:** The section is completely absent from the DOM until at least one testimonial is approved. No "no reviews yet" placeholder — the section simply doesn't exist until there's content to show.

Instead of profile photos (which the dynamic data doesn't have), it shows an avatar circle with the first letter of the client's name.

---

### `src/pages/admin/AdminPage.tsx` — testimonials tab

**New `view` state (`'bookings' | 'testimonials'`)**

The two main tabs are rendered as pill buttons at the top of the page. The testimonials tab shows a red badge with the pending count — visible even while on the bookings view so the trainer knows there's something to action.

**Lazy fetching:** `fetchTestimonials` is only called when `view === 'testimonials'` (via a `useEffect` that depends on `view`). Bookings load on mount; testimonials load on first tab switch. This avoids unnecessary requests on every page load.

**Approve in place:** Same pattern as cancel and reschedule — `handleApprove` updates the testimonial in state without re-fetching the full list:
```ts
setTestimonials(prev => prev.map(t => t.id === id ? { ...t, approved: true } : t));
```

---

## What Was Not Changed

- `ReviewsSection.tsx` — now contains real review copy (Jessie, James, Meowth). `TestimonialsSection` is an additive section rendered below it. Both coexist on the landing page.

  **Why two separate review sections?** `ReviewsSection` shows hardcoded static content — it always renders, giving the landing page social proof from day one even before any clients submit testimonials. `TestimonialsSection` shows real client-submitted feedback fetched from the API. It only renders when at least one testimonial is approved; before that, it's entirely absent from the DOM. Together, they ensure the page is never empty of reviews.
- `ReschedulePanel.tsx`, booking routes, calendar service — no changes needed
- Rate limiting in `app.ts` — `POST /api/testimonials` is covered by the existing `apiLimiter` on all `/api/*` routes
