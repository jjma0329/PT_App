---
status: resolved
trigger: "Selecting any date in the BookingModal results in 'Failed to load available times. Try again.'"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED. OAuthToken row exists in DB but the stored refresh token is invalid (invalid_grant). getAuthenticatedClient() calls refreshAccessToken() which throws, bubbles through getAvailableSlots -> slotsController catch -> HTTP 500.
test: Completed. curl returned { "success": false, "error": "invalid_grant" } with HTTP 500.
expecting: Fix = re-run OAuth flow via /auth/google to overwrite the stale token row.
next_action: Trainer opens http://localhost:3001/auth/google in a browser to complete re-auth.

## Symptoms

expected: Selecting a date shows available time slots fetched from GET /api/slots?date=YYYY-MM-DD
actual: Every date selection shows "Failed to load available times. Try again."
errors: HTTP 500. { success: false, error: "invalid_grant" }
reproduction: Open the app, click Book a Session, select any date
started: Phase 3 brand new -- booking system has never worked

## Eliminated

- hypothesis: No OAuthToken row exists (table empty -- flow never run)
  evidence: Server returns "invalid_grant" not "No OAuth token found" -- a row exists, the token is just stale
  timestamp: 2026-03-27T00:01:00Z

- hypothesis: Missing env vars / DB connection issue / route not mounted
  evidence: curl to /api/slots returns a valid JSON 500 (not a network error, not a 404, not a DB crash)
  timestamp: 2026-03-27T00:01:00Z

- hypothesis: Vite proxy misconfigured
  evidence: vite.config.ts proxy correctly maps /api -> http://localhost:3001
  timestamp: 2026-03-27T00:01:00Z

## Evidence

- timestamp: 2026-03-27T00:00:00Z
  checked: vite.config.ts
  found: server.proxy maps '/api' -> 'http://localhost:3001'
  implication: proxy is fine

- timestamp: 2026-03-27T00:00:00Z
  checked: prisma/schema.prisma
  found: OAuthToken model exists
  implication: table is migrated

- timestamp: 2026-03-27T00:00:00Z
  checked: calendarService.ts getAuthenticatedClient()
  found: if findFirst returns null -> throws "No OAuth token found"; if token expiring soon -> calls refreshAccessToken()
  implication: invalid_grant means a row exists but refresh token is revoked/invalid

- timestamp: 2026-03-27T00:01:00Z
  checked: curl GET http://172.28.112.1:3001/api/slots?date=2026-04-05
  found: HTTP 500, { "success": false, "error": "invalid_grant" }
  implication: root cause confirmed -- stored OAuth token is invalid; Google rejected the refresh

- timestamp: 2026-03-27T00:01:00Z
  checked: curl GET http://172.28.112.1:3001/auth/google
  found: HTTP 302 redirect to accounts.google.com with correct scopes (calendar.events) and redirect_uri
  implication: auth route works correctly; trainer can re-authorize by visiting this URL in a browser

## Resolution

root_cause: OAuthToken row exists in DB but contains a stale/revoked refresh token. When getAuthenticatedClient() detects the token is expiring soon and calls client.refreshAccessToken(), Google returns "invalid_grant" because the refresh token is no longer valid. This exception bubbles through getAvailableSlots() -> slotsController catch block -> HTTP 500 -> frontend slotsError=true.
fix: Trainer visits http://localhost:3001/auth/google in a browser. Google consent screen appears, trainer approves, callback exchanges code for fresh tokens, saveTokensFromCode() upserts OAuthToken id=1 with valid tokens. No code changes required.
verification: Trainer visited http://localhost:3001/auth/google, completed Google consent screen, received {"success":true,"data":"Google Calendar authorization complete."} -- fresh tokens upserted into OAuthToken table. Slot fetching confirmed working.
files_changed: []
