---
phase: 3
slug: booking-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None installed — manual smoke tests only |
| **Config file** | none |
| **Quick run command** | `curl -s -X POST http://localhost:3001/api/bookings -H "Content-Type: application/json" -d '{"name":"Test","email":"test@example.com","slotTime":"2026-04-10T18:00:00.000Z"}' \| jq .` |
| **Full suite command** | Manual checklist (see below) |
| **Estimated runtime** | ~5 minutes manual |

---

## Sampling Rate

- **After every task commit:** Verify server starts without errors (`npm run server`)
- **After every plan wave:** Run quick smoke curl and check DB row exists
- **Before `/gsd:verify-work`:** Full manual checklist must pass
- **Max feedback latency:** N/A — no test framework

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | BOOK-07 | smoke | `npx prisma migrate dev --name add_booking` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | BOOK-03 | smoke | `curl -s -X POST .../api/bookings ... \| jq .success` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 1 | BOOK-04 | manual | Submit same slot twice in two tabs | manual | ⬜ pending |
| 3-02-01 | 02 | 2 | CAL-05 | manual | Check Google Calendar after booking | manual | ⬜ pending |
| 3-02-02 | 02 | 2 | BOOK-05 | manual | Check visitor email inbox | manual | ⬜ pending |
| 3-02-03 | 02 | 2 | BOOK-06 | manual | Check trainer email inbox | manual | ⬜ pending |
| 3-03-01 | 03 | 2 | SEC-04 | smoke | `for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/bookings; done` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Booking` model added to `prisma/schema.prisma` and migration applied
- [ ] `npm install express-rate-limit` — required for SEC-04

*Note: No test framework to install. Wave 0 is DB migration + dependency install only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Calendar event created on booking | CAL-05 | Requires live Google Calendar OAuth | Submit a booking, check trainer's Google Calendar for new event at correct time |
| Visitor confirmation email delivered | BOOK-05 | Requires live Resend + domain verification | Submit booking, check the email address used — expect subject "Booking Confirmed" |
| Trainer notification email delivered | BOOK-06 | Requires live Resend + TRAINER_EMAIL env var | Submit booking, check TRAINER_EMAIL inbox — expect booking details |
| Double-booking rejected under race | BOOK-04 | Concurrent DB writes hard to automate without framework | Submit same slot twice in two browser tabs simultaneously — second gets 409 |
| Rate limiter fires at threshold | SEC-04 | Requires running server | `curl` loop of 12 POST requests — expect 429 after configured limit |
| Calendar OAuth scope allows event creation | CAL-05 | Requires re-auth flow | Visit /api/auth/google after scope change, complete OAuth, re-test booking |

---

## Validation Sign-Off

- [ ] Booking model migration applies cleanly
- [ ] POST /api/bookings returns 201 with valid payload
- [ ] POST /api/bookings returns 409 for duplicate slotTime
- [ ] POST /api/bookings returns 429 after rate limit exceeded
- [ ] Google Calendar shows new event after booking
- [ ] Visitor receives confirmation email
- [ ] Trainer receives notification email
- [ ] BookingModal wired into App.tsx and opens from CTA buttons
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
