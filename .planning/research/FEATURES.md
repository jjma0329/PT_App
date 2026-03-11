# Feature Research

**Domain:** Personal trainer marketing + booking website (no-account booking flow)
**Researched:** 2026-03-11
**Confidence:** MEDIUM — web search unavailable; findings based on training data (domain knowledge through Aug 2025) cross-referenced against project constraints in PROJECT.md. Confidence is HIGH for UX patterns that are broadly stable; MEDIUM for specifics around Google Calendar UX norms.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Available time slot display | Users cannot book without seeing when the trainer is free. Any booking UI without this is broken. | MEDIUM | Powered by Google Calendar free/busy read. Must show timezone clearly. |
| Calendar/date picker to browse availability | Users expect to click a date and see open slots — not scroll a plain list. | MEDIUM | Week or month view with disabled past dates and greyed-out fully-booked days. |
| Single-page booking form (no account required) | Most PT clients are referred or walk-in; account creation adds friction that kills conversions. | LOW | Name, email, phone, session type, optional message. PROJECT.md explicitly calls this out. |
| Instant confirmation page | After submit, users need on-screen confirmation before they close the tab. | LOW | Show booked date/time, trainer name, "check your email" prompt. |
| Confirmation email to client | Standard expectation. Users will not trust the booking held without an email receipt. | LOW | Resend already wired. Template: date, time, location/format, cancellation contact info. |
| Notification email to trainer | Trainer must know a booking landed. | LOW | Already exists for contact form; extend the same pattern. |
| Mobile-responsive booking flow | >60% of PT site traffic is mobile. A desktop-only booking UI loses more than half the audience. | MEDIUM | Touch-friendly tap targets (min 44px), readable slot list on small screens. |
| No double-booking protection | If two users pick the same slot simultaneously, only one can confirm. | MEDIUM | Google Calendar write + immediate re-read or optimistic lock on backend. |
| Session type selection | Different services (intro session, 60-min, 90-min) may have different durations. Users need to pick what they're booking. | LOW | Dropdown or card selector; maps to calendar event duration. |
| Clear CTA from services/pricing sections | Visitors reading about services must be able to reach the booking flow in one click. | LOW | "Book Now" buttons anchored to booking section or modal. |

### Differentiators (Competitive Advantage)

Features that set the site apart from generic booking tools (Calendly embeds, Mindbody widgets). These align with the core value: "discover, be impressed, book in under 2 minutes."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dark gym-aesthetic booking UI | Most PT booking widgets are generic white-label. A branded, high-energy dark UI reinforces the trainer's brand at the moment of purchase intent — the highest-intent moment on the site. | MEDIUM | Tailwind dark theme, bold typography, high-contrast slot buttons. Must match site's hero aesthetic. |
| Inline booking (no redirect to Calendly/Acuity) | Third-party booking embeds break the branded experience. Keeping the flow on-site removes the jarring visual switch and keeps trust intact. | HIGH | Entire booking UI built in React as part of the site. Google Calendar sync is the backend. |
| Real-time slot availability (no stale data) | Users who see "slot available" and then get a conflict email are frustrated. Fresh reads from Google Calendar on every session open reduces false positives. | MEDIUM | On component mount + on date selection, fetch `/api/availability?date=`. Cache for 30s max. |
| Slot refresh without page reload | If a user sits on the calendar for 5+ minutes (reading pricing), slots should refresh before they submit. | LOW | Poll or refetch on form focus. Prevents stale UI without forcing hard reload. |
| Time zone display and auto-detection | Clients booking from outside the trainer's time zone get confused if the displayed time is ambiguous. | LOW | Show slots in visitor's detected timezone (Intl.DateTimeFormat), note trainer's local timezone. |
| Friendly error states with recovery paths | Generic "something went wrong" errors cause abandonment. Specific messages ("That slot was just taken — pick another") keep users in the funnel. | LOW | Distinct error messages for: slot taken, validation failure, server error. Each with a next action. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Client login / account portal | "Clients should be able to see their history" | Adds auth complexity (sessions, password reset, email verification) that is out of scope for v1 and slows down every other feature. Most PT clients book 1-2x then churn or go ongoing via direct message. | Store booking in DB with client email as key. If history is needed later, add a "look up my bookings by email" flow — no passwords required. |
| Online payment at booking | "Capture payment upfront" | Stripe/payment integration is a separate milestone. Coupling payment to booking means a Stripe failure blocks a booking. Trainer likely collects payment in person or via Venmo for v1. | Note in confirmation email "payment collected at session." Add Stripe as v2 feature after booking flow is stable. |
| Cancellation / rescheduling self-service | "Clients should cancel themselves" | Requires booking lookup (token or account), cancel logic against Google Calendar, re-availability of slot, and notification emails. 3x the surface area of booking itself. | Confirmation email includes "to cancel or reschedule, reply to this email or text [trainer phone]." Trainer cancels via Google Calendar. |
| Recurring / package booking | "Book 10 sessions at once" | Requires package tracking, session counting, expiry logic, possibly payment. Way beyond v1 scope. | Trainer handles recurring clients via direct message after initial session is booked. |
| Waiting list for full slots | "Don't lose leads when fully booked" | Requires slot-watch logic, notification triggers, re-booking flow. Complex and low ROI for a solo trainer. | When a day is fully booked, show "Contact me directly" CTA pointing to the contact form. |
| Admin dashboard for managing bookings in-app | "Trainer should manage bookings from the site" | Adds auth, CRUD UI, calendar sync conflicts. Google Calendar already is the admin UI — the trainer lives in it. | Google Calendar is the source of truth. The site writes events; the trainer manages them there. |
| Real-time chat / live support widget | "Clients might have questions" | Adds infrastructure, notification requirements, and availability expectations. Contact form covers async questions. | Contact form with "I'll respond within 24 hours" messaging. |
| SMS notifications | "Remind clients via text" | Requires Twilio or similar, phone number collection, opt-in compliance (TCPA). High compliance surface for a solo trainer. | Email confirmation and reminder. Trainer can manually text clients from their phone. |

---

## Feature Dependencies

```
[Google Calendar OAuth2 setup]
    └──required by──> [Availability slot read (/api/availability)]
                          └──required by──> [Date/slot picker UI]
                                                └──required by──> [Booking form submission]
                                                                      └──required by──> [Booking saved to DB]
                                                                      └──required by──> [Confirmation email to client]
                                                                      └──required by──> [Notification email to trainer]
                                                                      └──required by──> [Google Calendar event write]

[Session type selection]
    └──enhances──> [Availability slot read] (slot duration filter)
    └──enhances──> [Google Calendar event write] (event title and duration)

[Confirmation page]
    └──requires──> [Booking form submission success]

[Slot refresh on form focus]
    └──enhances──> [Date/slot picker UI]

[Time zone auto-detection]
    └──enhances──> [Date/slot picker UI]

[Branded dark UI theme]
    └──enhances──> [All booking UI components] (styling only, no logic dependency)
```

### Dependency Notes

- **Google Calendar OAuth2 requires setup before any availability feature:** The trainer must authorize the app to read/write their calendar. This is a one-time setup with credentials stored as env vars. Without this, no slot data exists to display.
- **Availability read must exist before the slot picker:** The picker is useless without real data. Mock data is acceptable during development but the API contract must be real before the UI ships.
- **DB booking save and Google Calendar event write are parallel, not sequential:** Both happen after form submission. A failure in Calendar write should not roll back the DB record — log it and alert trainer separately.
- **Confirmation email requires a successful DB save:** Do not send a confirmation email unless the booking record is persisted. A sent email with no DB record is a phantom booking.
- **Session type selection is independent but high leverage:** It can be added before or after the core flow. But getting it right early avoids a schema migration later (booking record needs a `sessionType` field).

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed for the site to actually accept bookings.

- [ ] Google Calendar OAuth2 configured and available read working — without this, nothing else is possible
- [ ] `/api/availability` endpoint returning open slots for a given date range — the core data contract
- [ ] Date picker + slot list UI in React — the user-facing booking entry point
- [ ] Session type selector (even if just 2-3 hardcoded options) — affects event duration and confirmation copy
- [ ] Booking form (name, email, phone, session type, optional message) — the conversion action
- [ ] Double-booking protection on backend — mandatory for correctness
- [ ] Google Calendar event write on successful booking — closes the loop for trainer visibility
- [ ] Booking saved to Prisma/Neon DB — source of truth, decoupled from Calendar
- [ ] Confirmation email to client via Resend — trust signal; without this, clients won't trust the booking
- [ ] Notification email to trainer via Resend — operational necessity
- [ ] On-screen confirmation page/state — immediate feedback after form submit
- [ ] Mobile-responsive layout — non-negotiable given traffic patterns
- [ ] Rate limiting on booking endpoint — prevents spam/abuse (existing concern from CONCERNS.md)

### Add After Validation (v1.x)

Features to add once the core booking flow is confirmed working.

- [ ] Slot refresh on form focus — add once real users are using it and stale data is observed
- [ ] Time zone auto-detection and display — add when trainer confirms they have out-of-area clients
- [ ] Friendly/specific error states — refine error copy after seeing what errors actually occur in production
- [ ] "Contact me" CTA when fully booked — add once slot exhaustion is observed in practice
- [ ] Email reminder 24h before session — useful but requires a cron job; add after booking flow is stable

### Future Consideration (v2+)

Features to defer until booking flow is proven.

- [ ] Online payment (Stripe) — defer; changes booking flow substantially and requires its own milestone
- [ ] Cancellation/rescheduling self-service — defer; trainer handles via Google Calendar + direct message for now
- [ ] Client booking history (no-password lookup) — defer until clients actually request it
- [ ] Package/recurring session booking — defer; only relevant after the trainer grows beyond solo capacity
- [ ] SMS reminders — defer; compliance surface and infrastructure overhead not justified at v1 scale

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Google Calendar OAuth2 setup | HIGH | MEDIUM | P1 |
| Availability slot read API | HIGH | MEDIUM | P1 |
| Date/slot picker UI | HIGH | MEDIUM | P1 |
| Booking form (no account) | HIGH | LOW | P1 |
| Confirmation email to client | HIGH | LOW | P1 |
| Notification email to trainer | HIGH | LOW | P1 |
| On-screen confirmation state | HIGH | LOW | P1 |
| Double-booking protection | HIGH | MEDIUM | P1 |
| Google Calendar event write | HIGH | MEDIUM | P1 |
| Booking saved to DB | HIGH | LOW | P1 |
| Mobile-responsive booking UI | HIGH | MEDIUM | P1 |
| Rate limiting on booking endpoint | MEDIUM | LOW | P1 |
| Session type selector | MEDIUM | LOW | P1 |
| Branded dark UI for booking flow | MEDIUM | MEDIUM | P1 |
| Inline booking (no third-party embed) | MEDIUM | HIGH | P1 |
| Slot refresh on focus | LOW | LOW | P2 |
| Time zone display/auto-detect | MEDIUM | LOW | P2 |
| Specific/friendly error states | MEDIUM | LOW | P2 |
| "Contact me" when fully booked | LOW | LOW | P2 |
| Email reminder (24h before) | MEDIUM | MEDIUM | P2 |
| Online payment (Stripe) | HIGH | HIGH | P3 |
| Cancellation self-service | MEDIUM | HIGH | P3 |
| Client booking history | LOW | MEDIUM | P3 |
| Package booking | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

Note: Web search unavailable during this research session. Comparison based on training-data knowledge of Acuity Scheduling, Calendly, and Mindbody (confidence: MEDIUM).

| Feature | Acuity/Calendly | Mindbody | Our Approach |
|---------|-----------------|----------|--------------|
| Availability display | Real-time calendar from their DB | Real-time from Mindbody DB | Real-time from Google Calendar (source of truth the trainer already uses) |
| Booking form | Account optional or required | Account typically required | No account — frictionless |
| Confirmation | Email + in-app page | Email + member portal | Email + on-screen state (no portal) |
| Branding | White-label embed, limited customization | Mindbody brand always present | Fully custom dark gym aesthetic — no third-party watermark |
| Mobile UX | Good (responsive widgets) | App-first (web is secondary) | Responsive React — first-class web |
| Payment | Built-in (Stripe/Square) | Built-in (complex) | Out of scope v1 — trainer collects directly |
| Admin UI | Web dashboard | Full gym management suite | Google Calendar is the admin UI |
| Cancellation | Client self-service | Client self-service | Trainer handles via email/phone for v1 |

**Key differentiator:** The in-house booking UI means the trainer never asks clients to leave the branded experience or navigate a third-party product. The dark, high-energy design at the moment of booking intent reinforces the trainer's brand precisely when conversion happens.

---

## Sources

- Project context: `/mnt/c/Users/Jeffrey Ma/Documents/PT_App/.planning/PROJECT.md`
- Existing integrations audit: `/mnt/c/Users/Jeffrey Ma/Documents/PT_App/.planning/codebase/INTEGRATIONS.md`
- Codebase concerns: `/mnt/c/Users/Jeffrey Ma/Documents/PT_App/.planning/codebase/CONCERNS.md`
- Domain knowledge: Personal trainer booking UX patterns (training data, Aug 2025 cutoff) — MEDIUM confidence
- Competitor patterns: Acuity Scheduling, Calendly, Mindbody (training data) — MEDIUM confidence; verify against current feature pages before making design decisions that depend on competitive parity

---
*Feature research for: personal trainer marketing + booking website*
*Researched: 2026-03-11*
