# Architecture Research

**Domain:** Personal trainer booking site with Google Calendar integration
**Researched:** 2026-03-11
**Confidence:** HIGH (Google Calendar API v3 and OAuth2 server-side flow are stable, well-established patterns; verified against existing codebase)

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React + Tailwind)                     │
│                                                                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │  Marketing   │  │  Booking Flow    │  │  Confirmation Page     │  │
│  │  Pages       │  │  (slot picker +  │  │  (success state /      │  │
│  │  (static)    │  │   booking form)  │  │   email reminder)      │  │
│  └──────────────┘  └────────┬─────────┘  └────────────────────────┘  │
│                             │ fetch()                                  │
└─────────────────────────────┼────────────────────────────────────────┘
                              │ HTTP/JSON (via Vite proxy in dev)
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     EXPRESS API  (server/index.ts)                    │
│                                                                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │  /api/contact│  │  /api/slots      │  │  /api/bookings        │  │
│  │  (existing)  │  │  GET: available  │  │  POST: create booking │  │
│  │              │  │  time slots      │  │                       │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬────────────┘  │
│         │ controllers       │                        │               │
│  ┌──────▼───────────────────▼────────────────────────▼────────────┐  │
│  │                      Service Layer                              │  │
│  │  emailService.ts  │  calendarService.ts  │  bookingService.ts  │  │
│  └──────────────────────┬──────────────────────────┬──────────────┘  │
└─────────────────────────┼──────────────────────────┼─────────────────┘
                          │                          │
          ┌───────────────▼──────┐      ┌────────────▼───────────────┐
          │   Google Calendar    │      │   Neon PostgreSQL          │
          │   API v3             │      │   (via Prisma + PrismaPg)  │
          │   (OAuth2 token)     │      │   - ContactSubmission      │
          │   - freebusy query   │      │   - Booking                │
          │   - events.insert    │      │   - OAuthToken             │
          └──────────────────────┘      └────────────────────────────┘
                                                     │
                                        ┌────────────▼───────────────┐
                                        │   Resend (email)           │
                                        │   - booking confirmation   │
                                        │   - trainer alert          │
                                        └────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| React Marketing Pages | Static content sections (hero, about, services, pricing, reviews) | None (self-contained) |
| React Booking Flow | Slot picker UI, booking form, confirmation state | `/api/slots`, `/api/bookings` |
| `/api/slots` route + controller | Validate date range param, call calendarService, return available slots | calendarService.ts |
| `/api/bookings` route + controller | Validate booking payload, persist to DB, create calendar event, send emails | bookingService.ts, calendarService.ts, emailService.ts |
| `/api/auth/google` routes | OAuth2 initiation and callback — one-time trainer setup only | Google OAuth2 endpoints |
| calendarService.ts | Wrap Google Calendar API: freebusy query, event creation, token refresh | Google Calendar API v3, OAuthToken DB record |
| bookingService.ts | Persist Booking to DB, coordinate calendar + email side effects | Prisma, calendarService.ts, emailService.ts |
| emailService.ts (existing) | Send transactional email via Resend — now also sends booking confirmations | Resend API |
| Prisma schema | Source of truth for DB models: ContactSubmission, Booking, OAuthToken | Neon PostgreSQL |
| OAuthToken (DB model) | Store trainer's Google refresh token so server can act on trainer's behalf without interactive login | calendarService.ts |

---

## Recommended Project Structure

```
PT_App/
├── server/
│   ├── index.ts                    # Express app entry; mounts all routers
│   ├── routes/
│   │   ├── contact.ts              # existing
│   │   ├── slots.ts                # GET /api/slots?date=YYYY-MM-DD
│   │   ├── bookings.ts             # POST /api/bookings
│   │   └── auth.ts                 # GET /api/auth/google, GET /api/auth/google/callback
│   ├── controllers/
│   │   ├── contactController.ts    # existing
│   │   ├── slotsController.ts      # fetch available time windows
│   │   ├── bookingsController.ts   # create booking, trigger side effects
│   │   └── authController.ts       # OAuth2 initiation + callback handler
│   ├── services/
│   │   ├── emailService.ts         # existing (extend for booking emails)
│   │   ├── calendarService.ts      # Google Calendar API wrapper
│   │   └── bookingService.ts       # booking creation orchestration
│   └── lib/
│       └── googleAuth.ts           # OAuth2Client factory + token persistence helpers
│
├── src/                            # Vite frontend (React)
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Root layout + routing
│   ├── components/                 # Reusable UI components
│   │   ├── layout/
│   │   │   ├── NavBar.tsx
│   │   │   └── Footer.tsx
│   │   ├── marketing/              # Static section components
│   │   │   ├── HeroSection.tsx
│   │   │   ├── AboutSection.tsx
│   │   │   ├── ServicesSection.tsx
│   │   │   ├── PricingSection.tsx
│   │   │   └── ReviewsSection.tsx
│   │   └── booking/                # Booking flow components
│   │       ├── BookingModal.tsx     # Container modal
│   │       ├── SlotPicker.tsx       # Calendar/date + time slot grid
│   │       ├── BookingForm.tsx      # Name, email, phone, notes
│   │       └── BookingConfirmation.tsx
│   ├── pages/
│   │   └── HomePage.tsx            # Composes all marketing sections
│   ├── hooks/
│   │   ├── useAvailableSlots.ts    # Fetches /api/slots for a given date
│   │   └── useBooking.ts           # Submits booking, manages loading/error state
│   ├── lib/
│   │   └── api.ts                  # Typed fetch wrappers for all API calls
│   └── assets/                     # Images (existing)
│
├── prisma/
│   ├── schema.prisma               # Add Booking + OAuthToken models
│   └── migrations/
│
└── CLAUDE.md
```

### Structure Rationale

- **server/lib/googleAuth.ts:** Isolates OAuth2Client configuration and token read/write from the service layer. calendarService.ts depends on this, not on raw env vars or DB directly.
- **server/services/calendarService.ts:** All Google Calendar API calls go through one file. Mocking for tests is trivial. Token refresh logic lives here.
- **server/services/bookingService.ts:** Orchestrates the three-way side effect (DB write + calendar event + emails) from a single function so the controller stays thin.
- **src/hooks/:** Isolates fetch logic from UI components. Components describe what to show; hooks describe how to get the data.
- **src/lib/api.ts:** Single place to set base URL, handle JSON parsing, and propagate `{ success, data, error }` shapes consistently.

---

## Architectural Patterns

### Pattern 1: Trainer-Owned OAuth2 (Service Account Alternative)

**What:** The trainer completes a one-time Google OAuth2 flow (`/api/auth/google`) that issues a refresh token. The server persists that refresh token in the database and uses it for all future Calendar API calls without any user interaction. No client ever touches Google OAuth — it is purely a server-side credential.

**When to use:** Single-owner calendars where one person's calendar is the authoritative availability source. Correct for this project. A service account would require Google Workspace — unnecessary here.

**Trade-offs:** Requires the trainer to visit a URL once to authorize. Refresh tokens can be revoked; need to detect 401s from Google and prompt re-auth. Simple and zero per-user complexity.

**Flow:**
```
Trainer visits /api/auth/google
    ↓
Server redirects to Google consent screen
    ↓
Google redirects to /api/auth/google/callback?code=...
    ↓
Server exchanges code for { access_token, refresh_token }
    ↓
Server stores refresh_token in OAuthToken DB record (upsert)
    ↓
Server responds with "Calendar connected successfully"
    ↓
All subsequent calendar calls: read refresh_token from DB,
set on OAuth2Client, let google-auth-library auto-refresh
```

**Example:**
```typescript
// server/lib/googleAuth.ts
import { google } from 'googleapis';

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!  // e.g. http://localhost:3001/api/auth/google/callback
  );
}

export async function getAuthenticatedClient(prisma: PrismaClient) {
  const tokenRecord = await prisma.oAuthToken.findFirst();
  if (!tokenRecord) throw new Error('Google Calendar not connected. Trainer must authorize.');
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: tokenRecord.refreshToken });
  return client;
}
```

### Pattern 2: Freebusy Query for Availability

**What:** Use the Google Calendar `freebusy` endpoint to determine which time windows are occupied, then subtract those from a set of candidate slots to produce available times. Never expose raw calendar event data (privacy).

**When to use:** Any time you need to show a "pick a slot" UI without leaking meeting titles or attendee details. This is the correct approach for public-facing booking.

**Trade-offs:** Returns busy blocks only, not event details. Cannot distinguish "lunch" from "client session" — that is a feature, not a bug. Query is fast (single API call per date range).

**Example:**
```typescript
// server/services/calendarService.ts
export async function getAvailableSlots(date: string): Promise<TimeSlot[]> {
  const auth = await getAuthenticatedClient(prisma);
  const calendar = google.calendar({ version: 'v3', auth });

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: 'primary' }],
    },
  });

  const busySlots = data.calendars?.primary?.busy ?? [];
  return buildAvailableSlots(date, busySlots); // subtract busy from working hours
}
```

### Pattern 3: Optimistic Booking with Conflict Guard

**What:** When a booking is submitted, query freebusy for that exact slot before creating the event. If the slot is now occupied (race condition or double-booking), return 409 Conflict to the frontend. Only then create the calendar event and write the DB record.

**When to use:** Any booking system with concurrent users. A personal trainer has low volume, but the guard is cheap and prevents embarrassing double-bookings.

**Trade-offs:** Two Google API calls per booking (freebusy check + events.insert), but latency is negligible at this scale. Does not use pessimistic locks.

---

## Data Flow

### Booking Creation Flow

```
[User selects date in SlotPicker]
    ↓
useAvailableSlots hook → GET /api/slots?date=2026-03-15
    ↓
slotsController → calendarService.getAvailableSlots(date)
    ↓
calendarService → Google Calendar freebusy.query
    ↓
calendarService builds available 30/60-min slot list from working hours minus busy blocks
    ↓
Response: { success: true, data: [{ start, end, label }] }
    ↓
SlotPicker renders clickable time slots
    ↓
[User selects slot, fills BookingForm, submits]
    ↓
useBooking hook → POST /api/bookings
  Body: { name, email, phone, sessionType, slotStart, slotEnd, notes? }
    ↓
bookingsController validates input
    ↓
bookingService.createBooking():
  1. calendarService.checkSlotAvailable(slotStart, slotEnd)  ← conflict guard
     → if busy: throw ConflictError → controller returns 409
  2. prisma.booking.create({ data: { ...bookingFields, status: 'confirmed' } })
  3. calendarService.createEvent({ summary, start, end, attendees: [clientEmail] })
     → stores returned eventId on booking record (prisma.booking.update)
  4. emailService.sendBookingConfirmation(clientEmail, bookingDetails)
  5. emailService.sendTrainerBookingAlert(trainerEmail, bookingDetails)
    ↓
Response: { success: true, data: { bookingId, slotStart, slotEnd } }
    ↓
BookingConfirmation component shows success state
```

### Google OAuth2 Setup Flow (one-time trainer action)

```
Trainer visits http://localhost:3001/api/auth/google
    ↓
authController builds Google consent URL (scope: calendar.events + calendar.readonly)
    ↓
Trainer grants access in Google
    ↓
Google redirects to /api/auth/google/callback?code=AUTH_CODE
    ↓
authController exchanges code → { access_token, refresh_token }
    ↓
prisma.oAuthToken.upsert({ where: { id: 1 }, ... refreshToken })
    ↓
authController returns 200 "Calendar connected"
    ↓
All calendarService calls now function without trainer interaction
```

### React ↔ Express Communication

```
React (Vite dev server :5173)
    ↓ fetch('/api/...')
Vite proxy config (vite.config.ts): /api → http://localhost:3001
    ↓
Express server (:3001)
    ↓ { success, data, error } JSON
React (receives response, updates component state)
```

In production (Vite build + Express serves static files or a reverse proxy), the same `/api` prefix routes correctly. No CORS changes needed for production if Express serves the built frontend.

---

## Suggested Build Order

Dependencies between components determine the build order. Each phase unblocks the next.

```
Phase 1: React Frontend Foundation
  - Migrate vanilla HTML → React components + Tailwind
  - No new API calls needed; uses existing /api/contact
  - Unblocks: All subsequent phases (establishes component conventions)

Phase 2: Database Schema + Prisma Models
  - Add Booking and OAuthToken models to prisma/schema.prisma
  - Run migration
  - Unblocks: bookingService.ts, calendarService.ts (need DB to store tokens + bookings)

Phase 3: Google Calendar Integration (server-side only)
  - Install googleapis package
  - Build server/lib/googleAuth.ts + server/services/calendarService.ts
  - Build /api/auth/google routes for one-time trainer setup
  - Build GET /api/slots endpoint
  - Verify in isolation (curl or Postman) before building UI
  - Unblocks: SlotPicker component (needs the API to exist)

Phase 4: Booking API + Email Extensions
  - Build POST /api/bookings with bookingService.ts
  - Extend emailService.ts with booking confirmation templates
  - Conflict guard (freebusy re-check) added here
  - Unblocks: BookingForm + BookingConfirmation components

Phase 5: Booking UI
  - Build SlotPicker, BookingForm, BookingConfirmation components
  - Wire up useAvailableSlots and useBooking hooks
  - Full end-to-end booking flow usable
  - Unblocks: Final polish and production deployment

Phase 6: Production Hardening
  - Tighten CORS to known origins
  - Add rate limiting (express-rate-limit on /api/bookings and /api/slots)
  - Add input sanitization (DOMPurify or sanitize-html for email HTML content)
  - Add postinstall script for prisma generate
  - Deploy: serve Vite build from Express or reverse proxy
```

---

## Integration Points

### External Services

| Service | Integration Pattern | Auth | Notes |
|---------|---------------------|------|-------|
| Google Calendar API v3 | `googleapis` npm package, OAuth2Client with stored refresh token | Trainer's Google account via OAuth2 | Use `freebusy.query` for availability; `events.insert` for booking creation. Scope: `https://www.googleapis.com/auth/calendar.events` |
| Google OAuth2 | `googleapis` OAuth2Client, authorization code flow | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` env vars | One-time trainer authorization. Redirect URI must be registered in Google Cloud Console. |
| Resend | `resend` npm package (existing) | `RESEND_API` env var | Extend sendContactAlert pattern → add sendBookingConfirmation and sendTrainerBookingAlert functions |
| Neon PostgreSQL | Prisma ORM + `@prisma/adapter-pg` (existing) | `DATABASE_URL` env var | Add Booking and OAuthToken models to schema |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React → Express | `fetch('/api/...')` with JSON body/response | Vite proxies `/api` in dev. Use `src/lib/api.ts` for all calls to keep base URL and error handling centralized. |
| Controller → Service | Direct TypeScript function calls | Controllers own HTTP shape; services own business logic. Keep controllers thin (validate input, call service, return response). |
| calendarService → Google | `googleapis` library calls with OAuth2Client | All token refresh handled by OAuth2Client automatically once `setCredentials({ refresh_token })` is called. Detect 401 and surface re-auth instructions. |
| bookingService → calendarService | Direct function call | bookingService orchestrates the sequence; calendarService is purely a Google API wrapper. |
| bookingService → emailService | Direct function call | emailService has no knowledge of calendar; bookingService calls both independently. |

---

## New Prisma Models Required

```typescript
// Addition to prisma/schema.prisma

model Booking {
  id          Int      @id @default(autoincrement())
  name        String
  email       String
  phone       String?
  sessionType String?
  notes       String?
  slotStart   DateTime
  slotEnd     DateTime
  status      String   @default("confirmed")  // confirmed | cancelled
  calEventId  String?  // Google Calendar event ID, for cancellation/update later
  createdAt   DateTime @default(now())
}

model OAuthToken {
  id           Int      @id @default(autoincrement())
  provider     String   @default("google")
  refreshToken String
  updatedAt    DateTime @updatedAt
}
```

---

## Anti-Patterns

### Anti-Pattern 1: Creating a Service Account Instead of OAuth2 User Flow

**What people do:** Use a Google service account (JSON key file) instead of user OAuth2.
**Why it's wrong:** Service accounts cannot access a personal Google Calendar. They require Google Workspace/G Suite organizational calendars. A personal Gmail calendar is owned by a user, not an org.
**Do this instead:** Use OAuth2 web server flow. The trainer authorizes once; the server stores the refresh token in the database. No interactive login is needed after that.

### Anti-Pattern 2: Fetching All Calendar Events Instead of Freebusy

**What people do:** Call `events.list` to get all events, then filter client-side for availability.
**Why it's wrong:** Exposes private event titles and attendees to the server code (and potentially the client). More data to process. Requires broader Calendar scope.
**Do this instead:** Use `freebusy.query`. Returns only busy time windows with no event details. Faster, more private, requires narrower scope.

### Anti-Pattern 3: Calling Google Calendar Directly from the React Frontend

**What people do:** Put Google API calls in a React hook or component, exposing OAuth tokens to the browser.
**Why it's wrong:** Access tokens in the browser are readable by any JS on the page (XSS vector). The trainer's calendar would be accessible to anyone who inspects network traffic.
**Do this instead:** All Google Calendar calls stay server-side. The frontend only ever talks to `/api/slots` and `/api/bookings`. The Express server holds the credentials.

### Anti-Pattern 4: Creating a PrismaClient Per Controller (Existing Issue)

**What people do:** Instantiate `new PrismaClient()` at the top of each controller file (as currently done in contactController.ts).
**Why it's wrong:** Neon serverless connections have a limited pool. Multiple PrismaClient instances multiply connection usage and can exhaust the pool.
**Do this instead:** Create a single shared Prisma client instance in `server/lib/db.ts` and import it everywhere. One instance per process.

```typescript
// server/lib/db.ts
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
```

### Anti-Pattern 5: No Slot Locking During High Concurrency

**What people do (at scale):** Show a slot as available, let two users submit simultaneously, create two bookings for the same slot.
**Why it's not critical here:** A solo personal trainer has very low booking concurrency. Two people booking the same slot simultaneously is an edge case.
**Mitigation:** The conflict guard in bookingService (freebusy re-check before events.insert) handles this adequately at this scale. Do not over-engineer with DB locks or Redis queues for v1.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 bookings/month | Current monolith is fine. Single PrismaClient instance. Freebusy queries on-demand. |
| 100-1000 bookings/month | Cache available slots per day (5-minute TTL in memory or Redis) to reduce Google API calls. Still single server. |
| Multiple trainers | Add `trainerId` to Booking and OAuthToken models. Each trainer authorizes separately. |
| Real-time slot updates | Add WebSocket or SSE to push slot changes to open browsers. Not needed for v1. |

---

## Sources

- Google Calendar API v3 documentation (developers.google.com/calendar) — HIGH confidence; stable API, unchanged for years
- Google OAuth2 web server flow (developers.google.com/identity/protocols/oauth2/web-server) — HIGH confidence; standard flow
- `googleapis` npm package — the official Google Node.js client library, wraps all Google APIs including Calendar; maintained by Google
- Existing codebase analysis (routes → controllers → services pattern confirmed in server/) — HIGH confidence (direct inspection)
- Prisma documentation on connection pooling with Neon — HIGH confidence (well-documented)

---

*Architecture research for: PT App — Personal Trainer Booking + Google Calendar*
*Researched: 2026-03-11*
