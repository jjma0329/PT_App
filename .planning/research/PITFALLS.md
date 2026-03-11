# Pitfalls Research

**Domain:** Personal trainer booking site — Google Calendar two-way sync, no-auth booking, React migration from vanilla HTML
**Researched:** 2026-03-11
**Confidence:** HIGH (codebase directly inspected; pitfalls drawn from known Google Calendar API behavior, Prisma concurrency patterns, React migration patterns, and confirmed code issues in CONCERNS.md)

---

## Critical Pitfalls

### Pitfall 1: Google OAuth Refresh Token Lost After First Use

**What goes wrong:**
Google issues a refresh token exactly once — the first time a user grants access with `access_type=offline` and `prompt=consent`. If that token is not persisted to durable storage immediately and the server restarts or the token is overwritten, the OAuth flow must be restarted from scratch. For a trainer-side integration (not visitor-side), this means the trainer must re-authorize the app every time the token is lost.

**Why it happens:**
Developers store the token in memory (a module-level variable), in `.env` (read-only at startup), or log it without saving it. When the server restarts, the token is gone. Google will return `null` for the refresh token on subsequent authorizations unless `prompt=consent` is explicitly forced again.

**How to avoid:**
- Persist the full token object (access token, refresh token, expiry) to the database as a `GoogleToken` row immediately after the OAuth callback.
- At server startup, read the token from the database, not from env vars.
- Build a `/auth/google/callback` route that writes to the DB before redirecting.
- Never store the refresh token only in `.env` — it cannot be rotated there at runtime.

**Warning signs:**
- Code stores `tokens` on a module-level variable or in `process.env` at runtime.
- No database table/row for OAuth tokens exists.
- Server works until restart, then Google Calendar calls fail with `invalid_grant`.

**Phase to address:**
Google Calendar integration phase — must be the very first thing built before any availability-reading or event-creation logic.

---

### Pitfall 2: Double-Booking Due to Missing Database Transaction Lock

**What goes wrong:**
Two visitors submit a booking for the same time slot within milliseconds of each other. The backend reads available slots, both requests see the slot as free, both write a booking row — result: two confirmed bookings for one time slot, causing the trainer to be double-booked.

**Why it happens:**
A read-then-write pattern without a transaction or lock is a classic TOCTOU (time-of-check/time-of-use) race condition. It is not prevented by simply checking Google Calendar first — the window between the check and the DB insert is enough for a collision under any concurrent load.

**How to avoid:**
Use a PostgreSQL advisory lock or a unique constraint + upsert pattern:
- Add a `UNIQUE` constraint on `(startTime, status)` where status is `confirmed`.
- Or use `SELECT FOR UPDATE` inside a Prisma `$transaction` to lock the slot row while inserting.
- Or use a `unique` Prisma index on the time slot field combined with `createMany`'s skip-duplicates to detect conflicts.
- Write the DB row first (as `pending`), then create the Google Calendar event, then flip to `confirmed` — this serializes the critical section.

**Warning signs:**
- Booking endpoint does a `findFirst` for conflicts then a separate `create` outside a transaction.
- No `@@unique` constraint on the booking model's time slot field.
- No error handling for Prisma unique constraint violation (`P2002`).

**Phase to address:**
Booking system phase — the Prisma schema design must include the unique constraint before any booking endpoint is written.

---

### Pitfall 3: Timezone Mismatch Between Calendar, Database, and User Display

**What goes wrong:**
Google Calendar returns times in ISO 8601 with timezone offset. The database stores UTC. The visitor's browser is in a different timezone than the trainer. Without explicit normalization at every boundary, times displayed to the visitor are off by hours, booked slots conflict with what Google Calendar shows, and the trainer receives confirmation emails with the wrong local time.

**Why it happens:**
JavaScript `Date` objects are timezone-aware only if you treat them carefully. `new Date(string)` parses correctly, but `.toLocaleString()` uses the server's system timezone, not the user's. PostgreSQL stores `TIMESTAMP` as UTC but `TIMESTAMP WITH TIME ZONE` (which Prisma maps by default) does the right thing only if the application layer handles offsets correctly.

**How to avoid:**
- Store all times in the database as UTC (`DateTime` in Prisma = `TIMESTAMP WITH TIME ZONE`).
- Send UTC times to the frontend; let the browser convert using `Intl.DateTimeFormat` or a library like `date-fns-tz`.
- When creating Google Calendar events, always specify `timeZone` in the event's `start` and `end` objects explicitly — do not omit this field.
- Display times to the user in their browser's local timezone using `toLocaleString({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })`.
- In confirmation emails rendered server-side, use the trainer's configured timezone (store it as an env var or DB config) — do not use `new Date().toLocaleString()` which uses the server's system timezone.

**Warning signs:**
- Time slots look correct on localhost but shift by hours in production (different server timezone).
- Google Calendar event times don't match what the confirmation email says.
- No timezone handling code exists anywhere in the booking service.

**Phase to address:**
Booking system phase and Google Calendar integration phase — must be designed together, not retrofitted.

---

### Pitfall 4: Google Calendar Availability Polling Exposes Stale Slots

**What goes wrong:**
The booking UI shows a slot as available because the frontend fetched availability 5 minutes ago. In that window, the trainer manually blocked the time in Google Calendar, or another booking was confirmed. The visitor selects the slot, submits, and gets a confusing error — or worse, the booking goes through and conflicts with an existing event the trainer didn't block in the app.

**Why it happens:**
Fetching availability once on page load and caching it in React state without revalidation. The backend queries Google Calendar's `freebusy` API on demand but doesn't re-check at submission time.

**How to avoid:**
- Always re-query Google Calendar availability server-side at the moment of booking submission, not just when the UI loads.
- Treat the frontend slot display as a hint only — the definitive availability check happens at submit time on the backend.
- Consider a short TTL (30–60 seconds) on cached availability, with a re-fetch triggered when the user reaches the final booking step.

**Warning signs:**
- Availability is fetched once in a `useEffect` on mount and never refreshed.
- The booking submission endpoint trusts the time slot submitted by the client without re-verifying against Google Calendar.

**Phase to address:**
Google Calendar integration phase (availability reading) and booking system phase (submission validation).

---

### Pitfall 5: React Migration Breaks Existing Backend API Contract

**What goes wrong:**
During the React migration, fetch calls to `/api/contact` are rewritten. The new React form accidentally changes the request body shape (field names, nesting), breaking the existing Express controller which validates `name` and `email` at top level. The contact form silently fails or returns 400 errors.

**Why it happens:**
Vanilla-to-React migrations rewrite UI layer code. Developers focus on component structure and miss that the API contract must remain identical. The existing controller (`contactController.ts`) expects a flat body with `name`, `email`, `phone`, `goal`, `message`.

**How to avoid:**
- Define a shared TypeScript interface for the contact request body that both the React form and the Express controller import (or at minimum, document it explicitly).
- Test the contact form API call end-to-end immediately after the React migration, not at the end of the migration.
- Keep the migration to the UI layer only — do not touch server files during the frontend migration phase.

**Warning signs:**
- The React form uses a different field name than what the backend expects (e.g., `fullName` instead of `name`).
- No integration test or even a manual POST test after migration.

**Phase to address:**
React migration phase — first milestone check after standing up the React shell.

---

### Pitfall 6: Tailwind Not Configured for Vite + TypeScript Setup

**What goes wrong:**
`npm install tailwindcss` is run, a `tailwind.config.js` is created, but Tailwind classes don't apply because:
1. The `content` array doesn't include `./src/**/*.tsx` paths, so Tailwind purges all classes.
2. `@tailwind base/components/utilities` directives are missing from the CSS entry point.
3. The CSS entry point isn't imported in the React entry file (`main.tsx`).
4. With Tailwind v4 (likely given Vite 7 in the project), configuration is different — the `@import "tailwindcss"` directive replaces the three separate directives.

**Why it happens:**
Tailwind's setup steps are frequently outdated in tutorials (many show v3 steps, v4 changed the config model significantly). The Vite integration also requires the PostCSS plugin or the Vite-native Tailwind plugin.

**How to avoid:**
- Check whether Tailwind v4 is being used (different install: `@tailwindcss/vite` plugin for Vite, not PostCSS).
- For Tailwind v4 with Vite: install `tailwindcss` and `@tailwindcss/vite`, add the Vite plugin to `vite.config.ts`, use `@import "tailwindcss"` in CSS.
- For Tailwind v3: use the PostCSS plugin, add `content` paths explicitly.
- Verify Tailwind is working before building any components — add a test class (`bg-red-500`) on a visible element.

**Warning signs:**
- Tailwind classes have no visible effect.
- Browser devtools shows classes are in the DOM but no corresponding CSS rules exist.
- `tailwind.config.js` has an empty or missing `content` array (v3) or the Vite plugin is missing (v4).

**Phase to address:**
React migration phase — Tailwind must be verified working before migrating any section.

---

### Pitfall 7: PrismaClient Instantiated Per-Request (Already Present in Codebase)

**What goes wrong:**
The current codebase instantiates `new PrismaClient()` inside `contactController.ts` at module level, which creates a new connection pool on each import. When additional controllers are added (booking, calendar token storage), each will create its own `PrismaClient` instance, exhausting the Neon serverless connection limit quickly (Neon's free tier allows ~100 connections; each Prisma instance pools several).

**Why it happens:**
The pattern feels natural — put the client where you need it. It works during development with a single controller but fails at scale or when multiple controllers are loaded simultaneously.

**How to avoid:**
- Extract Prisma instantiation to a single shared module: `server/lib/prisma.ts` exports one `prisma` instance.
- All controllers import from that single module.
- With Neon serverless + `@prisma/adapter-pg`, the adapter handles connection pooling — one instance is sufficient.

**Warning signs:**
- `new PrismaClient()` appears in more than one file.
- Neon dashboard shows high connection count relative to request volume.
- `P1001` or connection pool exhaustion errors under moderate load.

**Phase to address:**
React migration phase or booking system phase — refactor before adding the booking controller.

---

### Pitfall 8: Google OAuth Callback Route Accessible on Production Without Protection

**What goes wrong:**
The `/auth/google` and `/auth/google/callback` routes are public. Anyone who discovers the URL can initiate a new OAuth flow. If the callback route writes the received token to the database without verifying the `state` parameter, an attacker can perform a CSRF attack — substituting their own authorization code for the trainer's, potentially linking their Google account.

**Why it happens:**
OAuth tutorials often omit the `state` parameter step as a simplification. The flow "works" without it, so developers ship without it.

**How to avoid:**
- Generate a cryptographically random `state` value before redirecting to Google.
- Store it in a short-lived server-side session or signed cookie.
- Verify the `state` returned in the callback matches before exchanging the code for tokens.
- Restrict `/auth/google*` routes to localhost or a secret path in production.

**Warning signs:**
- OAuth callback route has no `state` parameter check.
- The trainer authorization flow is accessible from the public internet without any access control.

**Phase to address:**
Google Calendar integration phase — must be in the initial OAuth implementation, not added later.

---

### Pitfall 9: Email HTML Injection (Confirmed in Current Codebase)

**What goes wrong:**
`server/services/emailService.ts` interpolates user-supplied `name`, `message`, `goal`, and `phone` directly into an HTML email string. A visitor submitting `<script>alert(1)</script>` as their name will inject that into the trainer's email. More practically, a visitor can inject arbitrary HTML content — custom links, misleading content, or broken layout — into the notification emails.

**Why it happens:**
Template literal interpolation into HTML feels natural. The developer intends to display user input, not execute it, but HTML-special characters (`<`, `>`, `&`, `"`) are not escaped.

**How to avoid:**
- Escape all user-supplied values before interpolating into HTML: replace `<` with `&lt;`, `>` with `&gt;`, `&` with `&amp;`, `"` with `&quot;`.
- Use a utility function or a template engine that auto-escapes (e.g., `he` npm package, or React's server-side rendering which escapes by default).
- Apply the same escaping to all future email templates (booking confirmations will also include user data).

**Warning signs:**
- Any `${variable}` inside an HTML string where the variable comes from `req.body`.
- No `escapeHtml` call or equivalent anywhere in `emailService.ts`.

**Phase to address:**
React migration phase (fix immediately as a security prerequisite) — this is already present in the codebase and must not be carried forward into booking email templates.

---

### Pitfall 10: Booking Without Rate Limiting Enables Slot Flooding

**What goes wrong:**
A bot submits hundreds of bookings in seconds, filling up time slots in the database. The trainer's Google Calendar receives hundreds of event creation requests (triggering Google API quota limits at 1,000,000 requests/day but more immediately hitting the 10 requests/second user rate limit). The trainer's inbox is flooded with confirmation emails. Legitimate visitors cannot book.

**Why it happens:**
The existing contact endpoint already has no rate limiting (confirmed in CONCERNS.md). The booking endpoint will have the same gap unless it's designed in from the start.

**How to avoid:**
- Add `express-rate-limit` to the booking endpoint: 3–5 booking attempts per IP per hour is reasonable.
- Apply rate limiting at the `/api/bookings` route before any business logic runs.
- For Google Calendar writes, wrap in a try/catch that gracefully handles `429` responses from the Google API and returns an appropriate error to the client.

**Warning signs:**
- Booking route handler has no rate-limit middleware.
- The existing `/api/contact` route (no rate limit) is used as a template for the booking route without adding limits.

**Phase to address:**
Booking system phase — must be added when the booking endpoint is created, not retrofitted.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store OAuth token in `.env` only | Simple, no DB schema needed | Token lost on server restart; trainer must re-authorize | Never — always persist to DB |
| `new PrismaClient()` in each controller | Colocation feels clean | Connection pool exhaustion when multiple controllers exist | Never — extract to shared module immediately |
| Read availability from Google Calendar once on page load | Fewer API calls | Stale slots shown; bookings for unavailable times pass through | Never — always re-verify server-side at submit |
| No transaction on booking insert | Simpler code | Double-booking race condition | Never for bookings |
| Skip `state` param in OAuth | Faster to implement | CSRF attack vector on the callback route | Never |
| Carry over current email HTML interpolation pattern into booking emails | Fast copy-paste | XSS/injection in all notification emails | Never |
| Vanilla CSS files kept alongside new Tailwind components | Faster migration start | Style conflicts; specificity wars; impossible to maintain | Only during first migration milestone, removed before completion |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Calendar API | Using `access_type=offline` without `prompt=consent` on first auth — no refresh token returned | Always force `prompt=consent` on first authorization; store the refresh token immediately |
| Google Calendar API | Forgetting to specify `timeZone` in event `start`/`end` objects | Always include `timeZone` field; Google will reject or misinterpret events without it |
| Google Calendar API | Querying `freebusy` with a time range that spans days — forgetting daylight saving transitions | Use full ISO 8601 with offset; test across DST boundary dates |
| Google Calendar API | Creating events using the trainer's personal `calendarId` vs primary — using `'primary'` is correct but only if the OAuth token belongs to the trainer's account | Confirm which calendar ID is used; prefer `'primary'` with trainer's token |
| Prisma + Neon | Creating `PrismaClient` per request — exhausts serverless connections | Singleton pattern in `server/lib/prisma.ts` |
| Prisma + Neon | Missing `postinstall` script — fresh `npm install` silently breaks server imports | Add `"postinstall": "prisma generate"` to `package.json` |
| Resend | Using `onboarding@resend.dev` sender in production — only works for test emails to verified addresses | Verify a custom domain in Resend; update `from` field before any real visitor receives email |
| Resend | Booking confirmation email fails silently after DB write succeeds — user sees error, data is saved | Separate DB write from email send; return success if DB write succeeds; log email failures separately |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching full Google Calendar event list to determine availability | Slow slot-loading, API quota burn | Use `freebusy` API endpoint — returns busy periods only, not full event data | Immediately if trainer has many events |
| Polling Google Calendar from the browser (client-side fetch to Google directly) | CORS errors, API key exposed in browser | Always proxy through the Express backend | First time anyone opens devtools |
| No caching on slot availability responses | Every slot render hits Google API | Cache availability response for 30–60s with a timestamp; invalidate on new booking | At 5+ concurrent visitors |
| Re-querying full availability list on every keystroke/interaction in booking UI | Excessive API calls | Fetch once per booking flow session; re-fetch only on explicit refresh or at submit | Immediately |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| OAuth tokens stored in `.env` or in-memory only | Trainer re-authorizes after every restart; tokens could be logged | Persist to DB; never log token values |
| No `state` param in OAuth flow | CSRF on callback — attacker substitutes their code | Generate + verify random `state` on each OAuth initiation |
| User input interpolated raw into email HTML (confirmed present) | HTML injection in trainer's email client | Escape all `req.body` values before HTML interpolation |
| Wildcard CORS on API (confirmed present) | Any site can call booking and contact endpoints | Restrict CORS to the known frontend origin in production |
| No rate limit on booking endpoint (pattern from existing contact endpoint) | Slot flooding, Google API quota exhaustion, email spam | `express-rate-limit` on all write endpoints before shipping |
| Google Calendar API credentials in frontend code | Credentials exposed; anyone can call Google APIs as the trainer | All Google Calendar calls must go through the Express backend only |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state during slot fetching | UI appears frozen; user doesn't know if it's working | Show skeleton or spinner immediately when fetching availability |
| Slot grid doesn't refresh after booking is confirmed | User can attempt to rebook the slot they just booked | Clear and re-fetch available slots on successful booking confirmation |
| Booking form submits then shows generic error if the slot was taken | User has no idea what happened — did it save? | Distinguish slot-conflict errors (409) from server errors (500); show specific message for each |
| No confirmation page or summary before final submit | User books wrong time, no recourse | Show a "Review your booking" step before final submission |
| Confirmation email arrives from `onboarding@resend.dev` | Looks like spam; damages trust | Verify domain in Resend, use trainer's business email as sender |
| Mobile booking flow assumes desktop date picker | Date/time selection unusable on mobile | Use `<input type="date">` and `<input type="time">` as a reliable mobile fallback or a touch-optimized picker |

---

## "Looks Done But Isn't" Checklist

- [ ] **Google OAuth:** Refresh token is persisted to the database — verify by restarting the server and confirming Google Calendar calls still work without re-authorizing.
- [ ] **Double-booking:** A unique constraint exists on the booking time slot — verify by attempting two simultaneous bookings for the same time in a test.
- [ ] **Timezone display:** Slot times shown in the booking UI match what appears in Google Calendar — verify with a trainer account in a different timezone than the server.
- [ ] **Email sender:** Confirmation emails come from a verified domain (not `onboarding@resend.dev`) — verify by checking the `from` field in a received email.
- [ ] **HTML escaping:** All user-submitted fields are escaped before email interpolation — verify by submitting `<b>test</b>` and checking the rendered email.
- [ ] **Rate limiting:** Booking endpoint rejects after N requests from the same IP — verify with a quick curl loop.
- [ ] **Tailwind purge:** Production build contains all used utility classes — verify by running `vite build` and checking that styles apply in the preview.
- [ ] **Prisma generate:** Running `npm install` on a fresh clone and then starting the server works without a manual `npx prisma generate` — verify in a clean environment.
- [ ] **CORS:** API rejects requests from origins other than the frontend domain in production — verify by calling the API from a different origin.
- [ ] **React migration completeness:** All 10 vanilla CSS files are removed and no `<link>` tags to them exist in the final HTML output — verify in the built `dist/`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Refresh token lost | MEDIUM | Force `prompt=consent` in OAuth URL, re-authorize, persist new token immediately |
| Double-booking occurred | MEDIUM | Contact one client to reschedule; add unique constraint + transaction retroactively; audit DB for other conflicts |
| Timezone shift discovered in production | HIGH | Audit all existing bookings for offset errors; add timezone normalization at every boundary; may need to contact affected clients |
| Resend sandbox sender used in production | LOW | Verify domain in Resend, update `from` field, redeploy |
| PrismaClient connection exhaustion | MEDIUM | Refactor to singleton, redeploy; Neon auto-recovers connections after idle timeout |
| React migration broke contact form | LOW | Revert React form to match original request body shape; add contract test |
| Tailwind not purging correctly | LOW | Fix `content` config / switch to v4 plugin, rebuild |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| OAuth refresh token not persisted | Google Calendar integration | Restart server, confirm Calendar API calls succeed without re-auth |
| Double-booking race condition | Booking system (schema design) | Simultaneous test requests for same slot return one success, one conflict |
| Timezone mismatch | Google Calendar integration + Booking system | Submit booking, verify Google Calendar event time and email confirmation time match |
| Stale availability at submit | Booking system (submission endpoint) | Manually block a slot in Google Calendar, attempt to book it — should be rejected |
| React migration breaks API contract | React migration | Run full contact form flow end-to-end after migration |
| Tailwind not working | React migration (setup step) | Add `bg-red-500` test class, verify it renders in browser |
| PrismaClient per controller | React migration or Booking phase | Grep for `new PrismaClient` — must appear only once |
| OAuth callback CSRF | Google Calendar integration | Verify `state` param is generated and validated |
| Email HTML injection | React migration (security fix) | Submit `<b>bold</b>` in name field, verify email shows literal text not bold |
| No rate limiting on booking | Booking system | Burst test with repeated requests, verify 429 response after threshold |

---

## Sources

- Codebase direct inspection: `server/services/emailService.ts`, `server/controllers/contactController.ts`, `server/index.ts`, `prisma/schema.prisma` (2026-03-11)
- `.planning/codebase/CONCERNS.md` — confirmed security issues and technical debt (2026-03-11)
- `.planning/codebase/INTEGRATIONS.md` — confirmed Resend sandbox sender and no auth (2026-03-11)
- Google Calendar API documentation: OAuth2 refresh token behavior (`access_type=offline`, `prompt=consent`) — HIGH confidence, well-documented behavior
- Google Calendar API freebusy endpoint design — HIGH confidence, stable API
- PostgreSQL advisory locks and `SELECT FOR UPDATE` semantics — HIGH confidence
- Prisma connection pooling behavior with Neon serverless — MEDIUM confidence (Neon's serverless driver changes this; singleton pattern is always correct regardless)
- Tailwind CSS v4 Vite integration — MEDIUM confidence (v4 was in active development near knowledge cutoff; verify current install instructions)
- Express rate limiting with `express-rate-limit` — HIGH confidence, stable library

---
*Pitfalls research for: Personal trainer booking site — Google Calendar sync, no-auth booking, React migration*
*Researched: 2026-03-11*
