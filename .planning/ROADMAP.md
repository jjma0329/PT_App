# Roadmap: PT App — Personal Trainer Website

## Overview

Three phases built in strict dependency order. Phase 1 migrates the existing vanilla HTML/CSS frontend to React + Tailwind and fixes confirmed security issues — establishing the component and styling conventions everything else builds on. Phase 2 establishes the Google Calendar server-side integration, which is the prerequisite for any slot availability feature. Phase 3 assembles the complete booking system end-to-end: the booking API, database models for bookings and OAuth tokens, and the booking UI components. When Phase 3 completes, a visitor can discover the trainer, select an available time slot, and book a session in under 2 minutes.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: React + Tailwind Migration** - Rebuild frontend in React + Tailwind; fix security baseline
- [ ] **Phase 2: Google Calendar Integration** - OAuth2 setup, availability slots API, token persistence
- [ ] **Phase 3: Booking System** - Complete booking flow: API, DB models, UI components, emails

## Phase Details

### Phase 1: React + Tailwind Migration
**Goal**: Visitors can browse a polished, fully responsive React site with dark gym aesthetic and a working contact form
**Depends on**: Nothing (first phase)
**Requirements**: MIGR-01, MIGR-02, MIGR-03, MIGR-04, MIGR-05, SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. Visitor can view all marketing sections (hero, about, services, pricing, reviews, footer) in a browser with no vanilla HTML/CSS files serving them
  2. Visitor can submit the contact form and receive a confirmation; form data saves to the database
  3. The site renders correctly on mobile (375px) and desktop (1280px) viewports
  4. The design uses a dark background with high-contrast typography and accent colors throughout all sections
  5. No wildcard CORS header is returned by the API; email templates do not interpolate raw user input into HTML
**Plans**: TBD

### Phase 2: Google Calendar Integration
**Goal**: The server can read the trainer's live availability from Google Calendar and return open time slots for a given date
**Depends on**: Phase 1
**Requirements**: CAL-01, CAL-02, CAL-03, CAL-04
**Success Criteria** (what must be TRUE):
  1. Trainer can complete a one-time Google OAuth2 authorization by visiting a setup URL and granting calendar access
  2. The OAuth2 refresh token persists to the database and survives a server restart (re-authorization is not required on restart)
  3. A GET request to `/api/slots?date=YYYY-MM-DD` returns an array of available time windows derived from the trainer's Google Calendar free/busy data
  4. Slots returned are filtered so no slot starts within 48 hours of the current time
**Plans**: TBD

### Phase 3: Booking System
**Goal**: A visitor can select an available time slot, submit a booking form, and receive a confirmation — with the booking recorded in the database and the trainer's Google Calendar
**Depends on**: Phase 2
**Requirements**: SEC-04, CAL-05, BOOK-01, BOOK-02, BOOK-03, BOOK-04, BOOK-05, BOOK-06, BOOK-07
**Success Criteria** (what must be TRUE):
  1. Visitor can browse available dates on a calendar picker and see specific time slots (e.g. "9:00 AM", "10:00 AM") for a selected date
  2. Visitor can fill in name, email, phone, and optional message, then submit the booking form
  3. Visitor sees an on-screen confirmation after a successful booking and receives a confirmation email
  4. Trainer receives a notification email with booking details and a new event appears in their Google Calendar
  5. A second booking attempt for the same slot is rejected (double-booking protection is enforced at the database and API layers)
**Plans**: TBD

### Phase 4: Trainer Auth + Admin UI
**Goal**: Trainer can log in via a protected /admin page, view all bookings with status filtering, and cancel bookings — without touching the terminal
**Depends on**: Phase 3
**Requirements**: AUTH-01, AUTH-02, ADMIN-01, ADMIN-02, ADMIN-03
**Success Criteria** (what must be TRUE):
  1. Trainer can log in at /admin/login with email + bcrypt-hashed password stored in .env; incorrect credentials are rejected
  2. JWT (24h expiry, signed with secret) is issued on login and stored in localStorage; all admin API calls attach it as Bearer token
  3. Unauthenticated requests to /admin/* redirect to /admin/login; JWT middleware returns 401 on invalid/expired tokens
  4. Trainer can view all bookings at /admin, filter by status (confirmed / cancelled), and cancel a confirmed booking
  5. requireApiKey middleware is replaced by JWT auth on all trainer-only routes
**Plans**: TBD

### Phase 5: Booking Reminders
**Goal**: Clients automatically receive a reminder email 24 hours before their session, reducing no-shows without any manual trainer action
**Depends on**: Phase 4
**Requirements**: REMIND-01, REMIND-02, REMIND-03
**Success Criteria** (what must be TRUE):
  1. A cron job runs hourly and finds all confirmed bookings with slotTime between 23–25 hours from now and reminderSentAt IS NULL
  2. A reminder email is sent to each matched client via Resend with the session date/time in the trainer's timezone
  3. reminderSentAt is stamped on the booking after sending so the reminder is never sent twice
**Plans**: TBD

### Phase 6: Rescheduling
**Goal**: Trainer can reschedule a confirmed booking to a new available slot from the admin UI, updating both the database and Google Calendar in one action
**Depends on**: Phase 5
**Requirements**: RESCHEDULE-01, RESCHEDULE-02, RESCHEDULE-03
**Success Criteria** (what must be TRUE):
  1. Trainer can select a new slot for an existing booking from the admin UI; the new slot must be available (not already booked)
  2. The booking record is updated with the new slotTime; the old Google Calendar event is deleted and a new one is created
  3. A rescheduled booking retains all original client details (name, email, phone, message)
**Plans**: TBD

### Phase 7: Testimonials
**Goal**: After a session completes, the client receives a review request email; submitted testimonials are stored and displayed on the public landing page
**Depends on**: Phase 6
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. A cron job sends a review request email to clients 1 hour after their session slotTime passes (one-time, tracked by reviewRequestSentAt)
  2. Client can submit a testimonial via a public POST /api/testimonials endpoint (name, rating, message)
  3. Submitted testimonials are stored in the database and visible in the trainer's admin UI for approval
  4. Approved testimonials appear in a Testimonials section on the public landing page
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. React + Tailwind Migration | 0/TBD | Complete | 2026-03-11 |
| 2. Google Calendar Integration | 0/TBD | Complete | 2026-03-14 |
| 3. Booking System | 0/TBD | Complete | 2026-03-18 |
| 4. Trainer Auth + Admin UI | 0/TBD | Complete | 2026-04-15 |
| 5. Booking Reminders | 0/TBD | Complete | 2026-04-16 |
| 6. Rescheduling | 0/TBD | Complete | 2026-04-16 |
| 7. Testimonials | 0/TBD | Complete | 2026-04-16 |
