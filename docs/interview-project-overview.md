# Project Overview: Personal Trainer Booking App

**Role:** Solo fullstack developer — designed, built, and shipped end-to-end  
**Stack:** React, TypeScript, Node.js + Express, PostgreSQL (Neon), Prisma, Google Calendar API, Resend, JWT

---

## What It Is

A production-ready booking platform for a personal trainer. Visitors browse the public site, check available session slots, and book in under two minutes. The trainer gets an admin dashboard where they can view, cancel, and reschedule bookings — all backed by live Google Calendar sync and automated email.

I built this in seven phases over roughly five weeks, each phase shipping as a working feature before the next began.

---

## The Problem I Was Solving

The trainer was handling scheduling through DMs and texts. No system, no confirmation emails, frequent double-bookings, and no way to see upcoming sessions at a glance. The goal was a real-world solution — not a CRUD demo — with actual Google Calendar integration, automated reminders, and a clean admin interface.

---

## System Architecture

```
                          ┌─────────────────────────────┐
                          │       React Frontend          │
                          │  (Vite + Tailwind + Router)   │
                          │                               │
                          │  /            LandingPage     │
                          │  /review      ReviewPage      │
                          │  /admin/login AdminLoginPage  │
                          │  /admin       AdminPage       │
                          └────────────┬────────────────-─┘
                                       │ HTTP / REST
                          ┌────────────▼────────────────-─┐
                          │       Express Server           │
                          │       (server/app.ts)          │
                          │                               │
                          │  Rate limiting (20 req/15min) │
                          │  Session middleware (OAuth)    │
                          │  JWT auth middleware           │
                          │                               │
                          │  /api/contact                 │
                          │  /api/slots                   │
                          │  /api/bookings                │
                          │  /api/auth  (trainer login)   │
                          │  /api/testimonials            │
                          │  /auth/google  (OAuth2)       │
                          └──────────┬───────────┬────────┘
                                     │           │
                    ┌────────────────▼─┐   ┌─────▼────────────────┐
                    │  PostgreSQL (Neon)│   │   External Services   │
                    │                  │   │                       │
                    │  ContactSubmission│   │  Google Calendar API  │
                    │  OAuthToken       │   │  Resend (email)       │
                    │  Booking          │   │                       │
                    │  Testimonial      │   └───────────────────────┘
                    └──────────────────┘
```

---

## How I Phased the Build

I used strict dependency ordering. Each phase had a clear goal and could not start until the previous was complete and working.

| Phase | What I Built | Why It Had to Come First |
|-------|-------------|--------------------------|
| 1 | React + Tailwind frontend, contact form, DB | Established all component and styling patterns |
| 2 | Google Calendar OAuth2, slot availability API | Booking system depends on live calendar data |
| 3 | End-to-end booking flow, confirmation emails | Admin UI is meaningless without data to manage |
| 4 | JWT auth, admin dashboard, cancel from UI | Reminders and reschedule need the admin layer |
| 5 | Automated 24h reminder emails (hourly cron) | Review requests need reminders working first |
| 6 | Reschedule from admin UI, calendar event swap | Testimonials need the full session lifecycle |
| 7 | Post-session review request, public testimonials | Final polish layer |

---

## Key Technical Decisions

### 1. Two-Layer Double-Booking Protection

The most important constraint in a booking system is: one slot, one booking. I handled this at two levels.

**API level:** Before writing, check if the slot is taken. Returns a clean 409 with a user-facing message.

**Database level:** `slotTime` has a `@unique` constraint in Prisma/PostgreSQL. If two requests slip through the API check in the same millisecond (a race condition), the database rejects the second `INSERT` with a `P2002` error. I catch that error code specifically and return the same 409 — the user experience is identical either way.

```
Request A (arrives first)       Request B (arrives 1ms later)
  findUnique → not found          findUnique → not found (A hasn't written yet!)
  prisma.create → INSERT ✓        prisma.create → P2002 unique violation
  201 Created                     409 Conflict (caught in outer catch)
```

Without the database constraint, a race condition means two people book the same slot and only one of them knows it.

---

### 2. Non-Fatal Side Effects

The booking record is the source of truth. Google Calendar and email are conveniences. I structured all three post-save steps as isolated, non-fatal try/catch blocks:

```ts
// Save booking — fatal if this fails
const booking = await prisma.booking.create({ ... });

// Non-fatal: calendar creation failure doesn't undo the booking
try { googleEventId = await createCalendarEvent(booking); } catch { ... }

// Non-fatal: email failure doesn't undo the booking
try { await sendBookingConfirmation(booking); } catch { ... }
```

If Google's API is down at the moment someone books, they still get booked. The trainer sees it in the admin dashboard. No data is lost because a third-party service had a blip.

---

### 3. Google OAuth2 Token Management

The trainer authorizes once. After that, the app manages tokens automatically:

- Tokens are stored in the database (not memory) so they survive server restarts.
- Before every Google API call, I check the token expiry. If it expires in under 5 minutes, I refresh it proactively — not after it fails.
- The 5-minute buffer prevents the race where a token with 30 seconds left expires mid-request.
- The OAuth flow uses a random `state` parameter stored in the session to prevent CSRF — someone can't forge a callback URL.

---

### 4. JWT Auth Over Static API Keys

Early in Phase 3, trainer-only routes were protected with a static API key in an `x-api-key` header. In Phase 4 I replaced that with JWT.

**Why:** A static key never expires. If it leaks, the attacker has permanent access with no revocation path. A JWT is signed with a secret, carries an expiry (`24h`), and can be verified entirely server-side — no database lookup on every request.

The trainer logs in at `/admin/login` with email + bcrypt-hashed password (both stored in env, not the database — solo trainer, no registration flow needed). The server issues a JWT. The frontend stores it in `localStorage` and attaches it as `Authorization: Bearer <token>` on every admin API call.

---

### 5. Cron-Driven Reminders and Review Requests

Two automated behaviors run on an hourly cron:

**24h reminders:** Find confirmed bookings where `slotTime` is between 23–25 hours from now and `reminderSentAt IS NULL`. Send the reminder, then stamp `reminderSentAt`. The stamp is the idempotency guard — if the cron fires twice in the same hour, the second run finds no eligible rows.

**Post-session review requests:** Same pattern using `reviewRequestSentAt`. Runs 1 hour after `slotTime` passes.

When a booking is rescheduled, `reminderSentAt` is reset to `null` so the client gets a fresh reminder for the new time. Without that reset, a reminded-then-rescheduled booking would never get a second reminder.

---

### 6. `server/app.ts` Split from `server/index.ts`

The Express app setup (middleware, route mounts) lives in `server/app.ts` which exports the `app` object. `server/index.ts` is the entry point — it calls `app.listen()` and starts the cron.

This separation matters for testing: the test suite imports `app` directly and makes HTTP requests with `supertest` without starting a real listener. If everything lived in `index.ts` alongside `app.listen()`, the test suite would either start a server on a port or require workarounds.

---

## Security Decisions

| Threat | Mitigation |
|--------|-----------|
| XSS in emails | `escapeHtml()` on all user-supplied fields before embedding in HTML email templates |
| CSRF on OAuth callback | Random `state` param generated on redirect, verified on callback against session value |
| Brute force / spam | Rate limiting: 20 requests per IP per 15-minute window on all `/api/*` routes (skipped in tests) |
| Unauthorized admin access | JWT middleware (`requireJwt`) on all trainer-only routes; fails closed if `JWT_SECRET` is unset (503, not 200) |
| Session hijacking during OAuth | `httpOnly` cookie, HTTPS-only in production, 10-minute TTL |
| Double-booking | `@unique` DB constraint as the final safety net against race conditions |

---

## Database Schema (Prisma / PostgreSQL)

```
ContactSubmission     OAuthToken          Booking                Testimonial
──────────────        ──────────          ────────               ───────────
id                    id                  id                     id
name                  provider            name                   name
email                 accessToken         email                  rating (1–5)
phone?                refreshToken        phone?                 message
goal?                 expiresAt           message?               approved (false)
message?              updatedAt           slotTime @unique       createdAt
createdAt                                 status (confirmed)
                                          googleEventId?
                                          reminderSentAt?
                                          reviewRequestSentAt?
                                          createdAt
```

`slotTime @unique` is the schema-level enforcement of the double-booking rule. Every other constraint is application logic — this one is the database's guarantee.

---

## What I'd Call Out in an Interview

**The booking race condition** is the most interesting problem. Most tutorials show the application-level check. The `@unique` constraint + `P2002` catch is what makes it actually safe under concurrency.

**Non-fatal side effects** is a pattern I'm proud of. It's tempting to make everything synchronous and rollback if anything fails. But a visitor's booking should not depend on Google's uptime. Separating what's essential (write to DB) from what's convenient (calendar event, email) is the right design.

**The token refresh buffer** in the OAuth client is a small detail that matters. Refreshing only after expiry means some requests fail mid-flight. Refreshing 5 minutes early means they don't.

**The `reminderSentAt` reset on reschedule** is easy to miss. Without it, the feature appears to work but breaks silently for anyone who reschedules after their first reminder would have been sent.

---

## What I'd Change With More Time

- **Move JWT storage from localStorage to an HttpOnly cookie.** LocalStorage is accessible to JavaScript, which means XSS can steal the token. An HttpOnly cookie can't be read by scripts.
- **Add a test for the race condition.** The logic is covered but the concurrent-request scenario isn't directly tested — it relies on the database constraint, which works, but a concurrency integration test would document that behavior explicitly.
- **Move trainer credentials to the database** with a proper users table. Right now the email + hashed password live in environment variables, which is fine for a solo trainer but doesn't scale to multiple trainers.
