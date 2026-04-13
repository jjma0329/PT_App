---
status: investigating
trigger: "OAuth re-run returned success but slot fetch still fails with 'Failed to load available times. Try again.'"
created: 2026-03-27T01:00:00Z
updated: 2026-03-27T01:01:00Z
---

## Current Focus

hypothesis: CONFIRMED. The token in DB was issued under the old calendar.readonly scope. Google's freebusy API requires calendar.events (or broader). The re-auth returned a token, but the Google Cloud Console OAuth app config never had calendar.events added as an approved scope -- so Google granted calendar.readonly again.
test: curl http://172.28.112.1:3001/api/slots?date=2026-04-05 returned HTTP 500 {"success":false,"error":"Request had insufficient authentication scopes."}
expecting: Fix = add https://www.googleapis.com/auth/calendar.events to the OAuth app's approved scopes in Google Cloud Console, then re-run /auth/google
next_action: Confirm whether this is a Cloud Console scope config issue or a different root cause

## Symptoms

expected: Selecting a date shows available time slots fetched from GET /api/slots?date=YYYY-MM-DD
actual: Every date selection shows "Failed to load available times. Try again." even after OAuth re-auth succeeded
errors: Unknown -- prior session saw HTTP 500 invalid_grant, but token is now refreshed. New error unknown.
reproduction: Open the app, click Book a Session, select any date
started: Phase 3 brand new -- has never worked. Re-auth did not fix it.

## Eliminated

- hypothesis: Stale/invalid OAuth refresh token (invalid_grant)
  evidence: Trainer completed OAuth flow and received {"success":true,"data":"Google Calendar authorization complete."} -- tokens are fresh
  timestamp: 2026-03-27T01:00:00Z

- hypothesis: Vite proxy misconfigured
  evidence: Prior session confirmed vite.config.ts proxy maps /api -> http://localhost:3001 correctly
  timestamp: 2026-03-27T01:00:00Z

## Evidence

- timestamp: 2026-03-27T01:01:00Z
  checked: curl http://172.28.112.1:3001/api/slots?date=2026-04-05
  found: HTTP 500, {"success":false,"error":"Request had insufficient authentication scopes."}
  implication: Token exists and auth passes, but Google rejects the freebusy query because the token scope is too narrow

- timestamp: 2026-03-27T01:01:00Z
  checked: curl http://172.28.112.1:3001/auth/google (check redirect URL)
  found: Redirect includes scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events -- the code is requesting the right scope
  implication: The code is correct. The problem is either the Google Cloud Console scope config or how Google cached the prior grant

- timestamp: 2026-03-27T01:01:00Z
  checked: calendarService.ts getAuthUrl() line 27
  found: scope is ['https://www.googleapis.com/auth/calendar.events'] -- correct and sufficient for freebusy
  implication: The auth URL requests the right scope. The token in DB must have been issued without this scope.

- timestamp: 2026-03-27T01:01:00Z
  checked: saveTokensFromCode() line 38
  found: throws if tokens.refresh_token is missing -- if Google skips consent and returns no refresh_token, the upsert never runs and the old narrow-scope token stays in DB
  implication: ALTERNATIVE hypothesis -- maybe the re-auth actually failed (threw at line 38), handleCallback caught it and returned the generic "Failed to save authorization tokens." -- but user saw {"success":true}, so this path did NOT happen. A new token WAS saved.

- timestamp: 2026-03-27T01:01:00Z
  checked: server/index.ts
  found: Server is running (process visible, WSL host IP responds). Route mounted at /api/slots correctly.
  implication: Server config is fine.

## Resolution

root_cause:
fix:
verification:
files_changed: []
