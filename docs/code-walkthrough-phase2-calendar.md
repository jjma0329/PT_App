# Code Walkthrough — Phase 2: Google Calendar OAuth + Slot Availability

**Audience:** Someone who knows Python well and is learning TypeScript/Node.js at a beginner–intermediate level.

---

## What Phase 2 Built

Two capabilities:
1. **OAuth2 authorization** — the trainer visits a URL once, grants the app access to their Google Calendar, and the tokens are stored in the database.
2. **Slot availability** — clients can request which 1-hour time slots are open on a given date, filtered against the trainer's real calendar events.

---

## Topology

```
Trainer browser                                           Google Cloud
└── GET /auth/google                                            │
        │                                                       │
        ▼                                                       │
Express Server (server/app.ts)                                 │
├── /auth/google         → authController.initiateAuth()       │
│       │ generates state, saves to session, redirects ───────►│
│       │                                                       │ consent screen
│       │◄── redirect with ?code=...&state=... ────────────────│
│       │                                                       │
├── /auth/google/callback → authController.handleCallback()     │
│       │ validates state                                       │
│       │ exchanges code for tokens ───────────────────────────►│
│       │◄── access_token + refresh_token ─────────────────────│
│       │ saves tokens to DB
│       │       └── prisma.oAuthToken.upsert()
│       │               └── PostgreSQL (OAuthToken table)
│       │
│
│   (Later — when a visitor requests available slots)
│
├── /api/slots?date=YYYY-MM-DD → slotsController.getSlots()
│       │ validates date format
│       │
│       └── calendarService.getAvailableSlots(date)
│               │ loads tokens from DB
│               │ refreshes token if expiring soon
│               │ builds candidate slots (hourly within working hours)
│               │ queries Google Calendar freebusy API ─────────►│
│               │◄── busy time blocks ─────────────────────────│
│               │ filters out busy + too-soon slots
│               └── returns array of ISO datetime strings
│
└── responds: { success: true, data: ["2026-03-20T18:00:00.000Z", ...] }
```

---

## Files Added in Phase 2

| File | Purpose |
|------|---------|
| `server/services/calendarService.ts` | All Google API logic (OAuth client, token management, slot generation) |
| `server/controllers/authController.ts` | Handles the two-step OAuth redirect flow |
| `server/controllers/slotsController.ts` | Validates input, calls `getAvailableSlots` |
| `server/routes/auth.ts` | Maps `/auth/google` and callback to controller functions |
| `server/routes/slots.ts` | Maps `/api/slots` to the slots controller |
| `server/types/session.d.ts` | TypeScript type extension for session data |
| `prisma/schema.prisma` | New `OAuthToken` model |
| `server/index.ts` | Session middleware added |

---

## Understanding OAuth2 First

Before looking at code, here's the concept:

OAuth2 is like getting a valet key for your car. You don't give the valet your main key (your Google password). Instead, Google issues a limited-access key (a token) that only allows what you approved (reading/writing your calendar).

**The flow:**
1. Our app redirects the trainer to Google: "Hey Google, this trainer wants to give our app calendar access."
2. Google shows a consent screen. The trainer clicks "Allow."
3. Google redirects back to our app with a one-time `code`.
4. Our app exchanges that `code` for two tokens:
   - **access_token** — short-lived (1 hour), used to make actual API calls
   - **refresh_token** — long-lived, used to get new access tokens without bothering the trainer again
5. We store both tokens in the database. Done — the trainer only needs to do this once.

---

## `prisma/schema.prisma` — The OAuthToken Model

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

This table stores the tokens the trainer grants us. Think of it as a safe for the valet key.

- `accessToken` — the working key, but it expires in ~1 hour
- `refreshToken` — the long-lived key used to get a new access token when it expires
- `expiresAt` — when the current access token stops working
- `updatedAt` — auto-updated by Prisma whenever the row is modified (Prisma handles this, you don't set it manually)

**Why store in the DB instead of memory?**
If the server restarts, in-memory data is lost. DB storage means the trainer authorizes once and the app keeps working indefinitely — even across restarts.

**Python analogy:**
```python
class OAuthToken(Base):
    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String, default="google")
    access_token = Column(String)
    refresh_token = Column(String)
    expires_at = Column(DateTime)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

---

## `server/types/session.d.ts` — TypeScript Type Extension

```ts
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
  }
}
```

By default, TypeScript doesn't know what properties our session objects have. This file extends the `express-session` type definition to say: "sessions can have an `oauthState` property that is either a string or undefined." Without this, TypeScript would throw a type error when we write `req.session.oauthState = ...`.

**`.d.ts` files** are "declaration files" — TypeScript-only files that add type information without adding any runtime code. They don't compile to JavaScript.

**Python analogy:** Like writing a stub file (`.pyi`) for a third-party library that doesn't include type hints.

---

## `server/app.ts` — Express App Setup

Phase 2 introduced session middleware alongside the existing routes. In the current codebase, all Express setup (middleware, route mounting) lives in `server/app.ts`, which exports the `app` object. `server/index.ts` is a separate entry-point file that imports `app`, starts listening on a port, and schedules cron jobs — it doesn't define any middleware or routes.

**Why the split?**
Tests import `app` directly (without calling `app.listen()`) so the test suite can make requests without starting a real server on a port. If everything lived in `index.ts` alongside `app.listen()`, tests would either start a real server or need to mock the startup. Keeping `app` in its own file makes it importable by both `index.ts` (production) and the test suite (tests).

### Session Middleware (inside `server/app.ts`)

```ts
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000, // 10 minutes in milliseconds
  },
}));
```

Sessions let the server remember a specific user across multiple HTTP requests. HTTP is stateless by default — each request arrives with no memory of previous ones. A session cookie ties requests together.

- `secret` — a private string used to sign the session cookie so it can't be forged by a visitor
- `resave: false` — don't re-save the session on every request if nothing changed (performance)
- `saveUninitialized: false` — don't create a session cookie until we actually put something in the session
- `httpOnly: true` — the cookie is invisible to JavaScript running in the browser (prevents XSS from stealing it)
- `secure: true in production` — the cookie is only sent over HTTPS in production; HTTP is allowed in development
- `maxAge: 10 minutes` — the session expires in 10 minutes, which is plenty of time to complete an OAuth flow

**Why sessions are needed here:**
During OAuth, we generate a random `state` value on the initial request. We need to remember that value when Google redirects back (a separate request). The session is how that value persists between those two requests.

---

## `server/services/calendarService.ts` — The Core Logic

This file contains all four functions that deal with Google Calendar. They're designed to work together in a chain.

---

### `createOAuthClient()`

```ts
export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.OAUTH_CLIENT,     // your app's client ID from Google Cloud
    process.env.OAUTH_SECRET,     // your app's client secret
    process.env.OAUTH_REDIRECT_URI, // where Google sends the user back after consent
  );
}
```

Creates a Google OAuth2 client object — this is the "identity card" our app shows to Google. The three values are registered in Google Cloud Console when you create a project.

**Why a factory function?**
A new client instance is needed in multiple places. Keeping this as a function avoids repeating the setup code. Each caller gets a fresh client with the same credentials.

**Python analogy:** Like a factory function `def create_google_client() -> OAuth2Session: ...` that returns a configured session.

---

### `getAuthUrl(state)`

```ts
export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state,
  });
}
```

Builds the URL the trainer visits to grant access. The function returns a string that looks like:
`https://accounts.google.com/o/oauth2/auth?client_id=...&redirect_uri=...&scope=...&state=abc123`

- `access_type: 'offline'` — **required** to receive a `refresh_token`. Without this, Google only gives a short-lived access token — the trainer would need to re-authorize every hour.
- `prompt: 'consent'` — forces Google to show the consent screen every time and re-issue a refresh token. Without this, Google only sends the refresh token the very first time. In development (where you might run the flow multiple times), this is essential.
- `scope: calendar.events` — we're requesting permission to read and write calendar events. This is the minimum needed to check free/busy AND create booking events.
- `state` — a random string we generated. Google echoes it back unchanged in the callback URL. We verify it matches what we stored in the session. This prevents CSRF attacks (someone else forging a callback request).

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
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
    create: {
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
  });
}
```

Takes the one-time `code` from Google's callback URL, exchanges it for real tokens, and saves them to the database.

**Step by step:**

1. `client.getToken(code)` — sends the code to Google's token endpoint and receives back the access token, refresh token, and expiry timestamp. This is a single HTTPS POST to Google.

2. The guard `if (!tokens.access_token || !tokens.refresh_token)` — both tokens must be present. The refresh token is absent if `prompt: 'consent'` was missing or the user previously authorized and Google skipped re-issuing it. Throwing here with a clear message saves debugging time.

3. `expiresAt` — Google returns `expiry_date` as a Unix timestamp in milliseconds. We convert it to a JS `Date`. The `??` (nullish coalescing) is like Python's `or` for `None`: if `expiry_date` is `null` or `undefined`, default to "1 hour from now."

4. `prisma.oAuthToken.upsert` — either inserts a new row or updates the existing one. We target `{ id: 1 }` because there's only ever one trainer. **Upsert** handles both first-time authorization and re-authorization (overwriting old tokens) with a single query.

**Python analogy:** `upsert` is like:
```python
token = db.query(OAuthToken).filter_by(id=1).first()
if token:
    token.access_token = new_access_token
else:
    db.add(OAuthToken(id=1, ...))
db.commit()
```

---

### Token Lifecycle — How Tokens Flow Through the System

It helps to see the full picture before reading `getAuthenticatedClient`. Tokens are stored in the database so they survive server restarts:

```
Trainer visits /auth/google (one-time setup)
    ↓
saveTokensFromCode()
    ↓
DB stores: accessToken, refreshToken, expiresAt
    ↓
(Server can restart freely — tokens persist in DB)
    ↓
Every API call (slots, create event, delete event):
    ↓
getAuthenticatedClient()
    ├── loads tokens from DB
    ├── if expiring in < 5 min → refreshes accessToken → saves new one to DB
    └── returns authenticated client ready to use
```

The `refreshToken` never expires (unless revoked by the trainer). The `accessToken` expires every hour. The 5-minute refresh buffer prevents mid-request failures.

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

This is called every time we need to make a Google API call. It loads the stored tokens and returns a ready-to-use authenticated client — handling token refresh automatically.

**Step by step:**

1. Load tokens from DB. If none exist, throw — the trainer hasn't authorized yet.

2. `client.setCredentials(...)` — load the stored tokens into the OAuth client in memory so it can sign API requests.

3. **Expiry check:** `stored.expiresAt.getTime() - Date.now()` gives milliseconds until expiry. `.getTime()` converts a `Date` to a Unix timestamp in ms. If less than 5 minutes remain, we refresh proactively.

4. **Why 5-minute buffer?** If we only refreshed *after* expiry, a request that starts with a token that has 30 seconds left could fail mid-call. The buffer prevents that race condition.

5. `client.refreshAccessToken()` — uses the stored `refresh_token` to ask Google for a new `access_token`. The refresh token itself doesn't expire (unless revoked).

6. Save the new access token to DB so the next request doesn't trigger another refresh.

7. `client.setCredentials(credentials)` — also update the in-memory client with the new token so *this* request uses it too.

**Why this function exists separately:**
Both `getAvailableSlots` and `createCalendarEvent` need an authenticated client. This function centralizes that logic — one place to load, validate, and refresh tokens.

---

### `getAvailableSlots(dateStr)`

```ts
export async function getAvailableSlots(dateStr: string): Promise<string[]> {
  const timezone = process.env.TRAINER_TIMEZONE ?? 'UTC';
  const requestedDate = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = requestedDate.getDay();  // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const [startHour, endHour] = WORKING_HOURS[isWeekend ? 'weekend' : 'weekday'];
  ...
}
```

Returns an array of available ISO datetime strings for a given date.

**The working hours config:**
```ts
const WORKING_HOURS = {
  weekday: [18, 22],  // 6 PM – 10 PM → candidate slots at 18, 19, 20, 21
  weekend: [16, 20],  // 4 PM – 8 PM  → candidate slots at 16, 17, 18, 19
};
```

**Step 1: Build candidate slots**
```ts
for (let hour = startHour; hour < endHour; hour++) {
  const slot = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
  candidates.push(slot);
}
```
Loops through each hour in the working window and builds a `Date` object for each potential 1-hour slot. `padStart(2, '0')` zero-pads single digit hours — `6` becomes `"06"` — so the ISO string is valid.

**Python analogy:**
```python
candidates = [
    datetime(year, month, day, hour)
    for hour in range(start_hour, end_hour)
]
```

**Step 2: Query Google freebusy**
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

`freebusy.query` asks Google: "what time ranges in this window are already occupied?" It deliberately returns **busy** blocks rather than free ones — Google's reasoning is that it's cheaper to send a small list of busy intervals than a potentially large list of free windows. We invert them: any candidate slot that doesn't overlap a busy block is available.

Example response:
```json
{ "primary": { "busy": [{ "start": "2026-05-06T18:00:00Z", "end": "2026-05-06T19:00:00Z" }] } }
```
→ 6–7 PM is occupied. Every other candidate slot is returned as available.

- `items: [{ id: 'primary' }]` — check the trainer's primary/main calendar
- `?.` (optional chaining) — safely access nested properties that might be `undefined`. Like Python's `x.get('key', {}).get('subkey', [])`.
- `?? []` — if the busy array is null/undefined, default to empty array

**Step 3: Filter the candidates**
```ts
// Earliest bookable moment: midnight at the start of the day 2 days from today.
// e.g. if today is May 3, slots on May 5 and later are allowed.
const today = new Date();
const earliestBookable = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);

const available = candidates.filter((slot) => {
  const slotStart = slot.getTime();
  const slotEnd = slotStart + 60 * 60 * 1000;  // 1 hour in milliseconds

  // Rule 1: Must be at least 2 calendar days from today
  if (slotStart < earliestBookable.getTime()) return false;

  // Rule 2: Must not overlap any busy block
  const overlaps = busyBlocks.some((block) => {
    const busyStart = new Date(block.start!).getTime();
    const busyEnd   = new Date(block.end!).getTime();
    return slotStart < busyEnd && slotEnd > busyStart;
  });

  return !overlaps;
});
```

Two filters in sequence:

**2-day advance rule:** Prevents last-minute bookings. The cutoff is midnight at the start of 2 calendar days from today — not a rolling 48-hour window. Example: if today is May 3 at 11pm, a slot on May 5 at 9am is allowed; a slot on May 4 is not. `new Date(year, month, day + 2)` handles month/year rollover automatically.

**Overlap check:** The formula `slotStart < busyEnd && slotEnd > busyStart` is the classic interval overlap test. Two ranges `[A, B]` and `[C, D]` overlap if `A < D && B > C`. In plain English: they overlap if one starts before the other ends AND ends after the other starts.

```
Example: slot = [6pm, 7pm], busy = [5:30pm, 6:30pm]
  slotStart(6pm) < busyEnd(6:30pm) ✓   →  6 < 6.5
  slotEnd(7pm) > busyStart(5:30pm) ✓   →  7 > 5.5
  → overlap! slot is filtered out
```

**Step 4: Return ISO strings**
```ts
return available.map((slot) => slot.toISOString());
```
Converts each `Date` to a standard ISO string like `"2026-03-20T22:00:00.000Z"`. The frontend receives this and formats it into local time for display.

---

## `server/controllers/authController.ts` — OAuth Flow

### `initiateAuth` — Step 1

```ts
import { randomBytes } from 'crypto';

export function initiateAuth(req: Request, res: Response): void {
  // crypto.randomBytes gives 256 bits of entropy — Math.random() is not a CSPRNG
  const state = randomBytes(32).toString('hex');
  req.session.oauthState = state;

  req.session.save((err) => {
    if (err) { res.status(500).json(...); return; }
    const url = getAuthUrl(state);
    res.redirect(url);
  });
}
```

**This route is protected by `requireJwt`** — only an authenticated trainer can initiate the OAuth flow. This prevents an anonymous attacker from triggering the consent screen redirect.

When the trainer visits `/auth/google` (from the admin UI):

1. Generate a cryptographically secure random state string using Node's built-in `crypto.randomBytes(32)` — produces 32 bytes (256 bits) of secure entropy, then hex-encoded to a 64-character string. `Math.random()` is NOT a cryptographically secure PRNG and was previously used here — it could theoretically be predicted. `randomBytes` is the correct choice for security tokens.
2. Store the state in the session.
3. `req.session.save(callback)` — explicitly save the session **before** redirecting. Without this, the redirect fires before the session is written to storage. The callback only redirects after the save confirms.
4. Redirect the trainer to the Google consent screen URL.

### `handleCallback` — Step 2

```ts
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) { ... }                                    // trainer denied
  if (!state || state !== req.session.oauthState) { ... } // CSRF check
  if (!code) { ... }                                    // missing code

  await saveTokensFromCode(code);
  req.session.oauthState = undefined;  // clear — state is single-use
  res.json({ success: true, data: 'Google Calendar authorization complete.' });
}
```

When Google redirects the trainer back to `/auth/google/callback?code=...&state=...`:

**Three validations before touching the DB:**
1. `error` — Google sends `error=access_denied` if the trainer clicked "Deny." Fail gracefully.
2. `state !== req.session.oauthState` — if the state parameter doesn't match what we stored in the session, the request didn't originate from our server. This is the CSRF check. We return `403 Forbidden`.
3. `!code` — shouldn't happen if Google behaves, but defensive programming.

**After saving tokens:**
Clear `oauthState` from the session — it's single-use. Leaving it means the callback URL could theoretically be replayed.

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

  try {
    const slots = await getAvailableSlots(date);
    res.json({ success: true, data: slots });
  } catch (err) {
    // Log the real error server-side; never expose internal messages to clients
    console.error('getSlots error:', err);
    res.status(500).json({ success: false, error: 'Unable to fetch available slots.' });
  }
}
```

Validates the `date` query parameter before forwarding to the calendar service. Two-layer validation:

**Regex check:** `/^\d{4}-\d{2}-\d{2}$/`
- `^` and `$` anchor the match to the full string — no partial matches
- `\d{4}` means exactly 4 digits, `\d{2}` means exactly 2 digits
- Would reject: `"2026-3-5"`, `"26-03-20"`, `"2026/03/20"`

**Date.parse check:** The regex alone accepts `"2026-13-99"` (month 13, day 99). `Date.parse` returns `NaN` for invalid dates. `!isNaN(...)` catches those.

**Why validate here and not in `getAvailableSlots`?**
Controllers handle HTTP concerns (validating request input, returning HTTP errors). Services handle business logic (querying Google, filtering slots). Keeping validation in the controller means the service function can be called from anywhere with trust that its input is already clean.

**Generic error message:**
If `getAvailableSlots` throws (e.g. Google API is down, OAuth token missing), the raw exception message is **not** sent to the client — it would leak internal details like `"No OAuth token found. Trainer must complete Google authorization first."` which tells an attacker exactly what's misconfigured. Instead, we log the real error server-side and return a safe generic message.

---

## Full Request Flow

```
Trainer browser                  Server                        Google API          DB
     │                              │                               │               │
     │── GET /auth/google ──────────►│                               │               │
     │                              │ generate state                │               │
     │                              │ save to session               │               │
     │◄── 302 redirect to Google ───│                               │               │
     │                              │                               │               │
     │── visits Google consent ────────────────────────────────────►│               │
     │◄── 302 redirect with ?code=...&state=... ───────────────────│               │
     │                              │                               │               │
     │── GET /auth/google/callback ─►│                               │               │
     │                              │ verify state == session.state │               │
     │                              │── exchange code for tokens ──►│               │
     │                              │◄── access_token + refresh_token               │
     │                              │── prisma.oAuthToken.upsert() ───────────────►│
     │◄── { success: true } ────────│                               │               │
     │                              │                               │               │
     │  (OAuth done. Now a visitor requests slots)                   │               │
     │                              │                               │               │
Client browser                     │                               │               │
     │── GET /api/slots?date=2026-03-20 ──────────────────────────►│               │
     │                              │ validate date format          │               │
     │                              │── load tokens from DB ──────────────────────►│
     │                              │◄── stored tokens ────────────────────────────│
     │                              │ (refresh if expiring soon)    │               │
     │                              │── freebusy.query() ──────────►│               │
     │                              │◄── busy blocks ───────────────│               │
     │                              │ filter candidates             │               │
     │                              │ remove before today+2 days    │               │
     │◄── { success: true, data: ["2026-03-20T22:00:00.000Z", ...] }│               │
```

---

## Key JavaScript/TypeScript Concepts Used

**Optional chaining `?.`**
```ts
freebusyResponse.data.calendars?.['primary']?.busy
// → if .calendars is undefined, returns undefined instead of throwing
// Python: data.get('calendars', {}).get('primary', {}).get('busy')
```

**Nullish coalescing `??`**
```ts
tokens.expiry_date ?? Date.now() + 3600 * 1000
// → if left side is null or undefined, use right side
// Python: tokens.expiry_date or (time.time() * 1000 + 3600000)
```

**Destructuring assignment**
```ts
const { code, state, error } = req.query;
// Python: code, state, error = req.query['code'], req.query['state'], req.query['error']
```

**Array destructuring**
```ts
const [startHour, endHour] = WORKING_HOURS['weekday'];
// Python: start_hour, end_hour = WORKING_HOURS['weekday']
```
