# Code Walkthrough — Phase 2: Google Calendar OAuth + Slot Availability

---

## Overview

Phase 2 adds two capabilities:
1. **OAuth authorization** — the trainer visits a URL once, grants the app access to their Google Calendar, and the app stores the tokens in the database.
2. **Slot fetching** — clients can query which 1-hour time slots are available on a given date, filtered against the trainer's real calendar.

Files added:
- `server/services/calendarService.ts` — all Google API logic
- `server/controllers/authController.ts` — handles the OAuth redirect flow
- `server/controllers/slotsController.ts` — validates input and returns slots
- `server/routes/auth.ts` — URL routing for auth
- `server/routes/slots.ts` — URL routing for slots
- `server/types/session.d.ts` — TypeScript type extension
- `prisma/schema.prisma` — new `OAuthToken` database model
- `server/index.ts` — session middleware added

---

## `prisma/schema.prisma` — The Database Model

```prisma
model OAuthToken {
  id           Int      @id @default(autoincrement())
  provider     String   @default("google")
  accessToken  String
  refreshToken String
  expiresAt    DateTime
  updatedAt    DateTime @updatedAt
}
```

**What it does:**
This defines a table in the database to store Google OAuth tokens. Think of it as a safe where we keep the keys to the trainer's Google Calendar.

- `accessToken` — short-lived key (expires in ~1 hour) used to make API calls
- `refreshToken` — long-lived key used to get a new access token when it expires
- `expiresAt` — when the access token expires, so we know when to refresh
- `updatedAt` — auto-updated by Prisma whenever the row changes

**Why store tokens in the DB instead of memory?**
If the server restarts, in-memory data is gone. Storing in the DB means the trainer only has to authorize once.

---

## `server/types/session.d.ts` — TypeScript Session Extension

```ts
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
  }
}
```

**What it does:**
By default, TypeScript doesn't know what properties our session object has. This file tells TypeScript "sessions can have an `oauthState` field that is a string (or undefined)." Without this, TypeScript would throw an error when we try to do `req.session.oauthState = ...`.

**Why it's a `.d.ts` file:**
Declaration files (`.d.ts`) are TypeScript-only — they add type information without adding runtime code. They "extend" existing types from third-party packages.

---

## `server/index.ts` — Session Middleware

```ts
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
  },
}));
```

**What it does:**
This registers session support on the Express server. A session is a way to remember a specific user across multiple HTTP requests (which are otherwise stateless).

- `secret` — a private string used to sign the session cookie so it can't be tampered with
- `resave: false` — don't re-save the session to the store if nothing changed (performance)
- `saveUninitialized: false` — don't create a session until something is actually stored in it
- `httpOnly: true` — the session cookie can't be read by JavaScript in the browser (prevents XSS theft)
- `secure: true in production` — cookie only sent over HTTPS in prod, HTTP allowed in dev
- `maxAge: 10 minutes` — the session expires after 10 minutes, which is enough to complete OAuth

**Why we need sessions here:**
During OAuth, we generate a random `state` value and need to remember it between two requests (the initial redirect and the callback). The session is how we do that.

---

## `server/services/calendarService.ts` — The Core Logic

This is the most important file. It has four exported functions.

---

### `createOAuthClient()`

```ts
export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.OAUTH_CLIENT,
    process.env.OAUTH_SECRET,
    process.env.OAUTH_REDIRECT_URI,
  );
}
```

**What it does:**
Creates a Google OAuth2 client — this is like an identity card that tells Google "this is our app." It uses credentials from `.env` that you register in Google Cloud Console.

- `OAUTH_CLIENT` — your app's client ID from Google Cloud
- `OAUTH_SECRET` — your app's client secret
- `OAUTH_REDIRECT_URI` — where Google sends the user back after they authorize (must exactly match what's registered in Google Cloud)

**Why a factory function?**
We need a fresh client in multiple places. Keeping it as a function avoids repeating the setup code.

---

### `getAuthUrl(state)`

```ts
export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    state,
  });
}
```

**What it does:**
Builds the Google consent screen URL that the trainer visits to grant access.

- `access_type: 'offline'` — required to receive a `refresh_token`. Without this, Google only gives you a short-lived access token and you'd need the trainer to re-authorize every hour.
- `prompt: 'consent'` — forces Google to show the consent screen every time and re-issue a refresh token. Without this, Google only sends the refresh token on the very first authorization.
- `scope: calendar.readonly` — we're requesting read-only access. We only need to check what's blocked — we never create or delete events.
- `state` — a random string we generated. Google echoes it back in the callback so we can verify the request is legitimate (CSRF protection).

---

### `saveTokensFromCode(code)`

```ts
export async function saveTokensFromCode(code: string): Promise<void> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Google did not return the expected tokens.');
  }

  const expiresAt = new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000);

  await prisma.oAuthToken.upsert({
    where: { id: 1 },
    update: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt },
    create: { provider: 'google', accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt },
  });
}
```

**What it does:**
Takes the one-time `code` from Google's callback URL, exchanges it for real tokens, and saves them to the database.

**Step by step:**
1. `client.getToken(code)` — sends the code to Google and gets back `access_token`, `refresh_token`, and `expiry_date`
2. We guard against Google not returning both tokens — this can happen if `prompt: 'consent'` is missing or the user already authorized before
3. `expiresAt` — we convert the Unix timestamp from Google into a JS Date. The `?? Date.now() + 3600 * 1000` is a fallback: if Google doesn't send an expiry, we assume 1 hour.
4. `prisma.oAuthToken.upsert` — either insert a new row or update the existing one. We use `where: { id: 1 }` because there's only ever one trainer. If a row with id=1 exists, update it; if not, create it.

**Why upsert?**
The trainer might re-authorize (e.g., they revoked access and need to reconnect). Upsert handles both cases — first-time and re-auth — with one query.

---

### `getAuthenticatedClient()`

```ts
export async function getAuthenticatedClient() {
  const stored = await prisma.oAuthToken.findFirst({ where: { provider: 'google' } });

  if (!stored) {
    throw new Error('No OAuth token found. Trainer must complete Google authorization first.');
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  });

  const fiveMinutes = 5 * 60 * 1000;
  const isExpiringSoon = stored.expiresAt.getTime() - Date.now() < fiveMinutes;

  if (isExpiringSoon) {
    const { credentials } = await client.refreshAccessToken();
    const newExpiresAt = new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000);

    await prisma.oAuthToken.update({
      where: { id: stored.id },
      data: {
        accessToken: credentials.access_token ?? stored.accessToken,
        expiresAt: newExpiresAt,
      },
    });

    client.setCredentials(credentials);
  }

  return client;
}
```

**What it does:**
Loads the stored tokens from the DB and returns a ready-to-use authenticated Google client. Automatically refreshes the token if it's about to expire.

**Step by step:**
1. Load tokens from DB — if none exist, throw a clear error telling the trainer to authorize first
2. `client.setCredentials(...)` — hand the stored tokens to the OAuth client so it can authenticate API calls
3. **Expiry check** — `stored.expiresAt.getTime() - Date.now()` gives milliseconds until expiry. If that's less than 5 minutes, we refresh proactively rather than waiting for an API call to fail
4. `client.refreshAccessToken()` — uses the stored `refresh_token` to ask Google for a new `access_token`
5. Save the new access token to the DB — so the next request doesn't trigger another refresh
6. `client.setCredentials(credentials)` — update the client with the new tokens in memory too

**Why the 5-minute buffer?**
If we only refreshed when already expired, a request that starts with a valid token could fail mid-flight. The buffer gives us a safety margin.

---

### `getAvailableSlots(dateStr)`

```ts
export async function getAvailableSlots(dateStr: string): Promise<string[]> {
  const timezone = process.env.TRAINER_TIMEZONE ?? 'UTC';
  const requestedDate = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = requestedDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const [startHour, endHour] = WORKING_HOURS[isWeekend ? 'weekend' : 'weekday'];
  ...
}
```

**What it does:**
Returns an array of available ISO datetime strings for a given date. It builds candidate slots, checks Google Calendar for busy times, and filters out anything blocked or too soon.

**Step by step:**

**1. Determine working hours by day type**
```ts
const WORKING_HOURS = {
  weekday: [18, 22], // 6 PM – 10 PM
  weekend: [16, 20], // 4 PM – 8 PM
};
```
Weekdays and weekends have different availability windows. `getDay()` returns 0 (Sunday) through 6 (Saturday).

**2. Build candidate slots**
```ts
for (let hour = startHour; hour < endHour; hour++) {
  const slot = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
  candidates.push(slot);
}
```
This loops through each hour in the working window and creates a Date object for each potential slot. `padStart(2, '0')` ensures hours are zero-padded (e.g., `06` not `6`).

**3. Query Google freebusy**
```ts
const freebusyResponse = await calendar.freebusy.query({
  requestBody: {
    timeMin: windowStart,
    timeMax: windowEnd,
    timeZone: timezone,
    items: [{ id: 'primary' }],
  },
});
const busyBlocks = freebusyResponse.data.calendars?.['primary']?.busy ?? [];
```
`freebusy.query` returns the **busy** time blocks (not the free ones — we invert them). `items: [{ id: 'primary' }]` means we're checking the trainer's main Google Calendar. The `?.` optional chaining and `?? []` fallback handle the case where Google returns no data.

**4. Filter candidates**
```ts
const available = candidates.filter((slot) => {
  const slotStart = slot.getTime();
  const slotEnd = slotStart + 60 * 60 * 1000; // 1 hour in ms

  if (slotStart < fortyEightHoursFromNow) return false;

  const overlaps = busyBlocks.some((block) => {
    const busyStart = new Date(block.start!).getTime();
    const busyEnd = new Date(block.end!).getTime();
    return slotStart < busyEnd && slotEnd > busyStart;
  });

  return !overlaps;
});
```
Two filters:
- **48-hour rule** — drop any slot starting within 48 hours of now (prevents last-minute bookings)
- **Overlap check** — the overlap condition `slotStart < busyEnd && slotEnd > busyStart` is the standard interval overlap formula. Two ranges overlap if one starts before the other ends AND ends after the other starts.

**5. Return ISO strings**
```ts
return available.map((slot) => slot.toISOString());
```
Converts each Date to a standard ISO string like `"2026-03-20T22:00:00.000Z"` so the frontend can parse and display it.

---

## `server/controllers/authController.ts` — OAuth Flow

### `initiateAuth`

```ts
export function initiateAuth(req: Request, res: Response): void {
  const state = Math.random().toString(36).slice(2);
  req.session.oauthState = state;

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ success: false, error: 'Session error.' });
      return;
    }
    const url = getAuthUrl(state);
    res.redirect(url);
  });
}
```

**What it does:**
Generates a random CSRF state token, saves it to the session, then redirects the trainer to Google's consent screen.

- `Math.random().toString(36).slice(2)` — generates a random alphanumeric string. `.toString(36)` converts to base-36 (0-9 + a-z). `.slice(2)` removes the leading `"0."`.
- `req.session.save(callback)` — we explicitly save the session **before** redirecting. Without this, the redirect can race the session write and the cookie may not be set in time when Google calls back.

### `handleCallback`

```ts
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) { ... }                              // trainer denied access
  if (!state || state !== req.session.oauthState) { ... }  // CSRF check
  if (!code) { ... }                              // no code received

  await saveTokensFromCode(code);
  req.session.oauthState = undefined;             // clear single-use state
  res.json({ success: true, data: 'Google Calendar authorization complete.' });
}
```

**What it does:**
Handles the redirect back from Google after the trainer grants (or denies) access.

**Three validation checks before touching the DB:**
1. `error` — Google sends this if the trainer clicked "Deny" on the consent screen
2. `state !== req.session.oauthState` — if the state doesn't match, the request didn't originate from our server (CSRF attack protection)
3. `!code` — shouldn't happen if Google is behaving, but we guard against it

After saving tokens, we clear `oauthState` from the session — it's single-use. Reusing a state value would be a security hole.

---

## `server/controllers/slotsController.ts` — Input Validation

```ts
export async function getSlots(req: Request, res: Response): Promise<void> {
  const { date } = req.query as { date?: string };

  if (!date) {
    res.status(400).json({ success: false, error: 'date query param is required (YYYY-MM-DD).' });
    return;
  }

  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
  if (!isValidDate) {
    res.status(400).json({ success: false, error: 'date must be in YYYY-MM-DD format.' });
    return;
  }

  const slots = await getAvailableSlots(date);
  res.json({ success: true, data: slots });
}
```

**What it does:**
Validates the incoming `date` query parameter before passing it to the calendar service.

- **Regex check** `/^\d{4}-\d{2}-\d{2}$/` — enforces the `YYYY-MM-DD` format exactly. `^` and `$` anchor to the full string so `"2026-03-20-extra"` fails.
- **`Date.parse` check** — the regex alone would accept `"2026-13-99"` (invalid month/day). `Date.parse` returns `NaN` for invalid dates, so `!isNaN(Date.parse(date))` catches those.
- **Early returns** — each guard returns immediately after sending a response. This avoids nested if/else and keeps the happy path at the bottom, easy to read.

---

## Request Flow Summary

```
Trainer browser                Server                        Google API          DB
     |                           |                               |               |
     |-- GET /auth/google ------->|                               |               |
     |                           |-- generate state              |               |
     |                           |-- save to session             |               |
     |<-- redirect to Google -----|                               |               |
     |                           |                               |               |
     |-- Google consent screen ---------------------------------->|               |
     |<-- redirect to /auth/google/callback?code=...&state=... --|               |
     |                           |                               |               |
     |-- GET /callback ---------->|                               |               |
     |                           |-- verify state                |               |
     |                           |-- exchange code for tokens -->|               |
     |                           |<-- access + refresh tokens ---|               |
     |                           |-- save tokens to DB -------------------------------->|
     |<-- { success: true } ------|                               |               |
     |                           |                               |               |
Client browser                  |                               |               |
     |-- GET /api/slots?date=... >|                               |               |
     |                           |-- validate date               |               |
     |                           |-- load tokens from DB -------------------------------->|
     |                           |-- freebusy query ------------>|               |
     |                           |<-- busy blocks ---------------|               |
     |                           |-- filter candidates           |               |
     |<-- { success: true, data: [...] }                         |               |
```
