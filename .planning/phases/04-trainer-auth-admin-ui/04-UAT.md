---
status: testing
phase: 04-trainer-auth-admin-ui
source: [derived from Phase 4 success criteria — no SUMMARY.md files exist]
started: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server. Start fresh with `npm run dev` (or equivalent).
  Server boots without errors. Visit http://localhost:5173 — landing page loads.
  Visit http://localhost:5173/admin/login — login page renders (not a blank screen or error).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start fresh with `npm run dev` (or equivalent). Server boots without errors. Visit http://localhost:5173 — landing page loads. Visit http://localhost:5173/admin/login — login page renders (not a blank screen or error).
result: [pending]

### 2. Login — Valid Credentials
expected: On /admin/login, enter the correct trainer email and password. Click Sign In. You should land on /admin (the dashboard) with no error message. The browser URL should change to /admin.
result: [pending]

### 3. Login — Invalid Credentials
expected: On /admin/login, enter a wrong password (keep the correct email). Click Sign In. An inline error appears: "Invalid credentials." You stay on /admin/login. No redirect happens.
result: [pending]

### 4. Protected Route Redirect
expected: While logged out (or in a private/incognito window with no token), navigate directly to http://localhost:5173/admin. You should be immediately redirected to /admin/login without seeing the dashboard.
result: [pending]

### 5. Booking List Loads
expected: After logging in, /admin shows a list of bookings. Each booking card shows: client name, session time (formatted, e.g. "Mon, Apr 14, 2026, 9:00 AM"), email, and a status badge (green "confirmed" or grey "cancelled"). Summary stats at the top show Total / Confirmed / Cancelled counts.
result: [pending]

### 6. Filter by Status
expected: On /admin, click the "Confirmed" filter tab. Only confirmed bookings appear. Click "Cancelled" — only cancelled bookings appear. Click "All" — all bookings return.
result: [pending]

### 7. Cancel a Booking
expected: On a confirmed booking, click "Cancel booking". An inline confirmation appears: "Cancel this booking?" with "Yes, cancel" and "Keep" buttons. Click "Yes, cancel". The booking's status badge changes to "cancelled" in place — no full page reload. The "Cancel booking" button disappears from that card.
result: [pending]

### 8. Logout
expected: On /admin, click "Sign out". You're redirected to /admin/login. If you then navigate back to /admin (browser back or direct URL), you're redirected to /admin/login again — the token is cleared.
result: [pending]

### 9. API Rejects Unauthenticated Requests
expected: Open browser devtools → Network tab. Log out. Then try to fetch GET /api/bookings directly (or observe any request made when hitting /admin without a token). The server returns HTTP 401. The UI redirects to /admin/login rather than showing broken data.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0

## Gaps

[none yet]
