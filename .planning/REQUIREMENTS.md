# Requirements: PT App — Personal Trainer Website

**Defined:** 2026-03-11
**Core Value:** A visitor can discover the trainer, be impressed by the site, and book a session in under 2 minutes.

## v1 Requirements

### Frontend Migration

- [ ] **MIGR-01**: Frontend rebuilt in React with TypeScript (functional components only)
- [ ] **MIGR-02**: All styling uses Tailwind CSS utility classes (no separate CSS files)
- [ ] **MIGR-03**: Dark, high-energy design system implemented (dark backgrounds, bold typography, high-contrast accents)
- [ ] **MIGR-04**: All existing marketing sections preserved and rebuilt in React (hero, about, services, pricing plans, reviews, footer)
- [ ] **MIGR-05**: Site is fully responsive on mobile and desktop

### Security Baseline

- [ ] **SEC-01**: Email templates sanitize user input (no raw HTML string interpolation)
- [ ] **SEC-02**: CORS restricted to known origins (not wildcard `*`)
- [ ] **SEC-03**: Shared Prisma client singleton used across all controllers (not per-module instances)
- [ ] **SEC-04**: Rate limiting applied to all API endpoints

### Google Calendar Integration

- [ ] **CAL-01**: Trainer can complete Google OAuth2 authorization via a setup route (one-time flow)
- [ ] **CAL-02**: OAuth2 refresh token persisted to database (survives server restarts)
- [ ] **CAL-03**: API endpoint returns available time slots by reading trainer's Google Calendar free/busy data
- [ ] **CAL-04**: Available slots filtered to exclude times within 48 hours of current time
- [ ] **CAL-05**: Confirmed bookings automatically create events in trainer's Google Calendar (two-way sync)

### Booking System

- [ ] **BOOK-01**: Visitor can browse available dates on a calendar picker
- [ ] **BOOK-02**: Visitor can select a specific time slot shown as exact times (e.g. "9:00 AM", "10:00 AM")
- [ ] **BOOK-03**: Visitor can submit a booking form (name, email, phone, message)
- [ ] **BOOK-04**: System prevents double-booking (unique DB constraint + conflict re-check before write)
- [ ] **BOOK-05**: Visitor receives booking confirmation email via Resend
- [ ] **BOOK-06**: Trainer receives booking notification email via Resend
- [ ] **BOOK-07**: Booking record saved to database (Prisma Booking model)

## v2 Requirements

### Client Management

- **CLNT-01**: Client can create an account and log in
- **CLNT-02**: Client can view their upcoming bookings
- **CLNT-03**: Client can cancel or reschedule a booking

### Admin

- **ADMN-01**: Trainer can view all bookings in an admin dashboard
- **ADMN-02**: Trainer can block off availability from the dashboard

### Payments

- **PAY-01**: Visitor can pay for session at time of booking (Stripe)
- **PAY-02**: Trainer receives payout via Stripe Connect

### Content

- **CONT-01**: Blog section with training tips and articles
- **CONT-02**: Multiple session type options on booking form

## Out of Scope

| Feature | Reason |
|---------|--------|
| Client login / accounts | Adds auth complexity; v1 booking requires no registration |
| Payment processing | Scope risk; trainer handles payment separately for now |
| Mobile app | Web-first; ngrok + responsive site covers mobile |
| Real-time chat | Not core to booking value |
| Admin dashboard UI | Trainer manages schedule via Google Calendar directly |
| Cancellation self-service | Handled out-of-band (email/phone) for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIGR-01 | Phase 1 | Pending |
| MIGR-02 | Phase 1 | Pending |
| MIGR-03 | Phase 1 | Pending |
| MIGR-04 | Phase 1 | Pending |
| MIGR-05 | Phase 1 | Pending |
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| CAL-01 | Phase 2 | Pending |
| CAL-02 | Phase 2 | Pending |
| CAL-03 | Phase 2 | Pending |
| CAL-04 | Phase 2 | Pending |
| SEC-04 | Phase 3 | Pending |
| CAL-05 | Phase 3 | Pending |
| BOOK-01 | Phase 3 | Pending |
| BOOK-02 | Phase 3 | Pending |
| BOOK-03 | Phase 3 | Pending |
| BOOK-04 | Phase 3 | Pending |
| BOOK-05 | Phase 3 | Pending |
| BOOK-06 | Phase 3 | Pending |
| BOOK-07 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap creation*
