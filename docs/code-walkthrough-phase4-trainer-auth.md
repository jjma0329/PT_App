# Code Walkthrough — Phase 4: Trainer Auth + Admin UI

**Audience:** Someone who knows Python well and is learning TypeScript/Node.js at a beginner–intermediate level.

---

## What Phase 4 Built

A login system for the trainer and a protected admin dashboard. Before this phase, admin routes were protected by a static `ADMIN_API_KEY` header — a blunt instrument that never expires and can't be revoked without a redeploy. Phase 4 replaced that with proper JWT-based auth:

1. Trainer visits `/admin/login`, enters email + password
2. Server verifies credentials against `.env`-stored values and returns a signed JWT
3. Frontend stores the JWT in `localStorage` and attaches it as a `Bearer` token on every admin API call
4. `requireJwt` middleware verifies the token on protected routes
5. The admin dashboard lets the trainer view, filter, and cancel bookings

---

## Topology

```
Frontend                          Backend                         .env
--------                          -------                         ----
src/App.tsx                       server/app.ts
  Route /admin/login                POST /api/auth/login
    AdminLoginPage.tsx  ---------->   trainerAuthController.ts
      src/lib/auth.ts                   bcrypt.compare(password, ADMIN_PASSWORD_HASH)
        setToken(jwt)   <-----------     jwt.sign({ role:'trainer' }, JWT_SECRET)
        isAuthenticated()
                                  server/middleware/requireJwt.ts
  Route /admin                      jwt.verify(token, JWT_SECRET)
    ProtectedRoute.tsx                next() or 401
      isAuthenticated()
        AdminPage.tsx
          authHeaders() ----------> GET  /api/bookings       (requireJwt)
                                    PATCH /api/bookings/:id/cancel  (requireJwt)
```

**Key relationships:**
- `src/lib/auth.ts` is the single source of truth for the JWT on the frontend — every component that needs to read, write, or clear the token goes through it
- `requireJwt` middleware is applied per-route in `server/routes/bookings.ts` — not globally, so public routes like `POST /api/bookings` are unaffected
- `ProtectedRoute` is a UX guard only — it prevents rendering the dashboard before the first API call returns, but the server always does its own verification

---

## Files Added in Phase 4

| File | Role |
|---|---|
| `server/controllers/trainerAuthController.ts` | Login handler — verifies credentials, issues JWT |
| `server/middleware/requireJwt.ts` | Middleware — verifies JWT on protected routes |
| `server/routes/trainerAuth.ts` | Mounts `POST /api/auth/login` |
| `src/lib/auth.ts` | Client-side JWT helpers (get, set, remove, check expiry) |
| `src/components/ProtectedRoute.tsx` | Frontend route guard — redirects to login if no valid token |
| `src/pages/admin/AdminLoginPage.tsx` | Login form UI |
| `src/pages/admin/AdminPage.tsx` | Admin dashboard — bookings list, filter, cancel |

**Files changed:**
- `server/app.ts` — registers `trainerAuthRouter` at `/api/auth`
- `server/routes/bookings.ts` — adds `requireJwt` to `GET /api/bookings` and `PATCH` routes

---

## Understanding JWT First

A JWT (JSON Web Token) is a string with three base64-encoded parts separated by dots:

```
header.payload.signature
```

- **Header** — algorithm used to sign (`HS256`)
- **Payload** — the data claims: `{ role: 'trainer', iat: 1234567890, exp: 1234654290 }`
- **Signature** — `HMAC-SHA256(header + "." + payload, JWT_SECRET)`

The signature is what makes it trustworthy. Anyone can decode the payload (it's just base64), but only the server that knows `JWT_SECRET` can produce a valid signature. `jwt.verify()` recomputes the signature and compares — if it doesn't match, the token was tampered with and is rejected.

**Python analogy:** Like an HMAC-signed cookie in Flask — `itsdangerous.URLSafeTimedSerializer` signs a payload and can verify it later without storing anything server-side.

---

## `server/controllers/trainerAuthController.ts` — Login Endpoint

```ts
export async function trainerLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    res.status(400).json({ success: false, error: 'Email and password are required.' });
    return;
  }

  const expectedEmail = process.env.ADMIN_EMAIL;
  const passwordHash  = process.env.ADMIN_PASSWORD_HASH;
  const jwtSecret     = process.env.JWT_SECRET;

  if (!expectedEmail || !passwordHash || !jwtSecret) {
    res.status(503).json({ success: false, error: 'Admin credentials not configured.' });
    return;
  }

  // Case-insensitive email match
  const emailMatch = email.trim().toLowerCase() === expectedEmail.toLowerCase();

  // Always run bcrypt.compare even if email is wrong
  const passwordMatch = await bcrypt.compare(password, passwordHash);

  if (!emailMatch || !passwordMatch) {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }

  const token = jwt.sign({ role: 'trainer' }, jwtSecret, { expiresIn: '24h' });
  res.json({ success: true, data: { token } });
}
```

### Why credentials live in `.env`, not the database

There is exactly one trainer. Adding a `users` table, a signup flow, and a password reset system would be significant complexity for a problem that doesn't exist. `.env` values are set once when the server is deployed and never touched again. If this ever needed to support multiple trainers, migrating to a DB-backed users table is straightforward.

### bcrypt — what it is and why

`bcrypt.compare(plaintext, hash)` takes the raw password the trainer typed and the bcrypt hash stored in `.env`, and returns `true` if they match.

You never store the plain password — you store a hash. bcrypt is slow by design (it has a configurable "cost factor") which makes brute-force attacks impractical. Even if `.env` leaks, an attacker only has the hash, not the password.

**Python analogy:** Like `werkzeug.security.check_password_hash(stored_hash, password)` in Flask.

To generate the hash for your `.env`, run once in Node:
```ts
import bcrypt from 'bcrypt';
console.log(await bcrypt.hash('your_password', 12));
```

### Timing attack prevention

Notice that `bcrypt.compare` runs **even when the email is wrong**:

```ts
const emailMatch    = email.trim().toLowerCase() === expectedEmail.toLowerCase();
const passwordMatch = await bcrypt.compare(password, passwordHash); // always runs
```

If we returned early when the email didn't match, an attacker could measure response times: a fast response means wrong email, a slow response (bcrypt takes ~100ms) means right email, wrong password. Running bcrypt unconditionally keeps response time constant regardless of which field failed.

### User enumeration prevention

Both wrong email and wrong password return the same error: `'Invalid credentials.'` — not `'Email not found'` or `'Wrong password'`. If those were separate messages, an attacker could confirm which emails are registered.

### The JWT payload

```ts
const token = jwt.sign({ role: 'trainer' }, jwtSecret, { expiresIn: '24h' });
```

The payload only contains `role: 'trainer'`. No user ID, no email, no PII. This is intentional — we only need to know the caller is a trainer. The token expires in 24 hours; after that, `jwt.verify()` throws and the middleware returns 401.

---

## `server/middleware/requireJwt.ts` — Auth Guard

```ts
export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  const token = authHeader.slice(7); // strip 'Bearer '
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(503).json({ success: false, error: 'Auth not configured.' });
    return;
  }

  try {
    jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}
```

`jwt.verify()` does two things in one call:
1. Recomputes the signature and checks it matches — catches tampering
2. Checks the `exp` claim — catches expired tokens

If either check fails, it throws. We catch it and return 401. If both pass, `next()` is called and Express moves on to the route handler.

**Fail closed:** If `JWT_SECRET` isn't in `.env`, the middleware returns 503 rather than accidentally letting requests through. A misconfigured environment fails loudly.

**Why middleware and not inline checks?** The verification logic would have to be copied into every protected handler. As a middleware, it's one function applied to specific routes — one place to update if the auth scheme ever changes.

---

## `server/routes/trainerAuth.ts` — Route Registration

```ts
const router = Router();
router.post('/login', trainerLogin);
export default router;
```

Mounted in `app.ts` as:
```ts
app.use('/api/auth', trainerAuthRouter);
```

So the full path is `POST /api/auth/login`.

---

## `src/lib/auth.ts` — Client-Side JWT Utilities

```ts
const TOKEN_KEY = 'admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

### `isAuthenticated()` — client-side expiry check

A JWT is three base64 parts joined by dots. The middle part is the payload. `token.split('.')[1]` grabs it, `atob()` decodes the base64, `JSON.parse()` converts it to an object.

```
eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoidHJhaW5lciIsImV4cCI6MTIzNH0.signature
                      ^--- this part is the payload
```

`payload.exp` is a Unix timestamp in **seconds** (JWT standard). `Date.now()` is in **milliseconds**. Multiplying by 1000 converts before comparing.

**This is not a security check** — `atob` decoding doesn't verify the signature. The server does that. This check exists purely to avoid rendering the admin UI and immediately getting a 401 back. It's a UX shortcut, not a security gate.

### `authHeaders()`

Returns `{ Authorization: 'Bearer <token>' }` if a token exists, or an empty object if not. Used in every admin fetch call:

```ts
const res = await fetch('/api/bookings', { headers: authHeaders() });
```

**Why localStorage and not a cookie?** An `httpOnly` cookie would be more secure against XSS (JavaScript can't read it). However, `httpOnly` cookies are sent automatically by the browser, which opens up CSRF risks without additional protection. For a single-trainer admin tool on a known domain, localStorage is an acceptable tradeoff. A more hardened production system would use `httpOnly` + `SameSite=strict` cookies.

---

## `src/components/ProtectedRoute.tsx` — Frontend Route Guard

```ts
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}
```

Used in `App.tsx`:
```tsx
<Route
  path="/admin"
  element={
    <ProtectedRoute>
      <AdminPage />
    </ProtectedRoute>
  }
/>
```

When React renders the `/admin` route, it first renders `ProtectedRoute`. If `isAuthenticated()` returns false, React Router immediately redirects to `/admin/login` before `AdminPage` even mounts — no flash of the dashboard, no failed API calls.

`replace` in `<Navigate replace>` replaces the current history entry instead of pushing a new one. This means hitting the browser back button after being redirected to login won't send the trainer back to `/admin` (which would just redirect them again).

**This is a UX guard, not a security boundary.** If someone tampered with localStorage to inject a fake token, `isAuthenticated()` might return true (it only checks expiry, not the signature). But the first API call would return 401, and the 401 handler in `AdminPage` clears the token and redirects to login anyway.

---

## `src/pages/admin/AdminLoginPage.tsx` — Login Form

```ts
// If already logged in, skip straight to admin dashboard
useEffect(() => {
  if (isAuthenticated()) navigate('/admin', { replace: true });
}, [navigate]);
```

Runs once on mount. If the trainer visits `/admin/login` while already logged in (e.g. they bookmarked it), they're silently forwarded to `/admin`. No need to log in again.

```ts
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setLoading(true);

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json() as { success: boolean; data?: { token: string }; error?: string };

    if (!res.ok || !json.success) {
      setError(json.error ?? 'Login failed. Please try again.');
      return;
    }

    setToken(json.data!.token);
    navigate('/admin', { replace: true });
  } catch {
    setError('Network error. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

- `e.preventDefault()` — stops the browser from doing a full page form submission (the default behavior for `<form>`)
- On success, `setToken()` saves the JWT to localStorage, then navigates to the dashboard
- `finally` block ensures `setLoading(false)` runs whether the request succeeded or failed — so the button is never stuck in a disabled state

---

## `src/pages/admin/AdminPage.tsx` — Dashboard

### State groups

The component manages two independent data sets (bookings and testimonials) with their own loading/error states:

```
UI state:
  view: 'bookings' | 'testimonials'   which tab is active

Bookings state:
  bookings[]         raw data from API
  filter             'all' | 'confirmed' | 'cancelled'
  loading / error    fetch lifecycle
  confirmingId       which booking is showing inline cancel confirm
  cancellingId       which booking is mid-cancel request
  reschedulingId     which booking has the reschedule panel open

Testimonials state:
  testimonials[]           raw data from API
  testimonialsLoading/Error  fetch lifecycle
  approvingId              which testimonial is mid-approve request
```

### Fetching bookings

```ts
const fetchBookings = useCallback(async () => {
  const res = await fetch('/api/bookings', { headers: authHeaders() });

  if (res.status === 401) {
    removeToken();
    navigate('/admin/login', { replace: true });
    return;
  }
  // ...
}, [navigate]);

useEffect(() => { fetchBookings(); }, [fetchBookings]);
```

`authHeaders()` attaches `Authorization: Bearer <token>`. If the server returns 401 (expired or invalid token), the frontend clears the stale token and redirects to login — the trainer is prompted to re-authenticate rather than seeing a cryptic error.

`useCallback` memoizes `fetchBookings` so it doesn't get recreated on every render. Without this, the `useEffect` dependency array would trigger an infinite loop: render -> new fetchBookings reference -> effect fires -> state update -> render -> repeat.

### Filtering

```ts
const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
```

Filtering happens entirely on the frontend — no new API call for each filter change. All bookings are fetched once and the UI filters the local array. This is fast and avoids unnecessary server round-trips.

### Cancel confirm pattern

Cancellation uses a two-step inline confirm to prevent accidental taps:

```
Step 1: "Cancel booking" button sets confirmingId = booking.id
Step 2: UI swaps to show "Cancel this booking? [Yes, cancel] [Keep]"
Step 3a: "Yes, cancel" calls handleCancel() -> PATCH /api/bookings/:id/cancel
Step 3b: "Keep" sets confirmingId = null -> back to step 1
```

Only one booking shows the confirm UI at a time — clicking "Cancel booking" on a second booking replaces the first confirm.

### 401 handling on every action

Every fetch in `AdminPage` — `fetchBookings`, `fetchTestimonials`, `handleCancel`, `handleApprove` — has the same 401 check:

```ts
if (res.status === 401) {
  removeToken();
  navigate('/admin/login', { replace: true });
  return;
}
```

This handles the case where the trainer leaves the dashboard open for more than 24 hours. Their token expires while the page is still open. The next action they take hits a 401, which clears the stale token and sends them back to login. The UX is seamless — no error screen, just a redirect.

---

## Full Request Flow

**Login:**
```
Trainer                AdminLoginPage             Server (.env)
  |                         |                          |
  | types email+password    |                          |
  | clicks "Sign In" -----> |                          |
  |                         | POST /api/auth/login     |
  |                         | { email, password } ---> |
  |                         |                          | emailMatch check
  |                         |                          | bcrypt.compare(password, hash)
  |                         |                          | jwt.sign({ role:'trainer' }, secret)
  |                         | <-- { token: "eyJ..." } -|
  |                         | setToken(token)          |
  |                         | navigate('/admin')       |
  | <-- admin dashboard ----|                          |
```

**Authenticated request:**
```
AdminPage              Server
  |                      |
  | GET /api/bookings    |
  | Authorization:       |
  |   Bearer eyJ... ---> |
  |                      | requireJwt middleware
  |                      |   jwt.verify(token, secret)
  |                      |   -> valid: next()
  |                      | getBookings controller
  |                      |   prisma.booking.findMany()
  | <-- { data: [...] } -|
```

---

## Environment Variables Used

| Variable | Purpose |
|---|---|
| `ADMIN_EMAIL` | The trainer's login email — compared case-insensitively |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the trainer's password (generated once, stored here) |
| `JWT_SECRET` | Secret used to sign and verify tokens — must be long and random |

Generating a secure `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Generating the password hash:
```bash
node -e "import('bcrypt').then(b => b.default.hash('your_password', 12).then(console.log))"
```

---

## Key Concepts Summary

| Concept | Where used | Python analogy |
|---|---|---|
| bcrypt hash comparison | `trainerAuthController.ts` | `werkzeug.security.check_password_hash()` |
| JWT sign + verify | controller + middleware | `itsdangerous.URLSafeTimedSerializer` |
| Timing-safe auth | Always run bcrypt even if email wrong | Constant-time comparison in `hmac.compare_digest()` |
| Express middleware | `requireJwt` | Flask `@requires_auth` decorator |
| `useCallback` | `fetchBookings`, `fetchTestimonials` | Memoizing a function to avoid re-creation |
| Frontend expiry check | `isAuthenticated()` in `auth.ts` | Decoding a JWT payload without verifying the signature |
