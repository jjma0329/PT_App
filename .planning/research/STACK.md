# Stack Research

**Domain:** Personal trainer booking site — React + Express + Prisma with Google Calendar two-way sync
**Researched:** 2026-03-11
**Confidence:** MEDIUM (Context7/WebSearch unavailable; based on official docs knowledge + codebase inspection)

---

## Existing Stack (Locked)

These are already installed and pinned. Do not change.

| Technology | Version (installed) | Purpose |
|------------|---------------------|---------|
| React | 19.2.0 | Frontend UI framework |
| TypeScript | 5.9.3 | Type safety throughout |
| Vite | 7.3.1 | Build tooling + dev server |
| Express | 5.2.1 | REST API server |
| Prisma ORM | 7.4.2 | Database ORM (`prisma-client` generator) |
| `@prisma/adapter-pg` | 7.4.2 | Prisma's pg driver adapter for Neon |
| Neon PostgreSQL | (managed) | Serverless Postgres database |
| Resend | 6.9.3 | Transactional email (booking confirmations) |
| `tsx` | 4.21.0 | TypeScript execution for dev server |

**CRITICAL: Prisma 7 uses a new generator syntax.** The schema uses `provider = "prisma-client"` (not the legacy `@prisma/client`). Output goes to `src/generated/prisma`. Any new Prisma work must follow this pattern — do NOT revert to the old `@prisma/client` import path.

---

## New Libraries Required

### Core Technologies (New)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `tailwindcss` | ^4.1 | Utility-first CSS for all UI styling | Project mandate (CLAUDE.md); v4 is current as of 2025 with faster builds and no config file needed for basic use |
| `@tailwindcss/vite` | ^4.1 | Vite plugin for Tailwind v4 | Tailwind v4 integrates via Vite plugin instead of PostCSS — simpler, faster |
| `googleapis` | ^144 | Official Google API client for Node.js | The canonical library for Google Calendar API; maintained by Google; covers OAuth2 + Calendar v3 API in one package |
| `clsx` | ^2.1 | Conditional class merging | Lightweight utility for building className strings; pairs with Tailwind for conditional styling |
| `tailwind-merge` | ^3 | Merge Tailwind classes without conflicts | Prevents duplicate utility conflicts (e.g., two `text-*` classes); essential when building reusable components |

### Supporting Libraries (New)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-day-picker` | ^9 | Date picker calendar UI | Booking date selection; headless-friendly, Tailwind-compatible, actively maintained; v9 adds full React 18+ support |
| `date-fns` | ^4 | Date math and formatting | Required peer dep for `react-day-picker`; handles slot calculation, formatting display times; do not use `moment.js` |
| `express-rate-limit` | ^7 | Rate limiting for API endpoints | Required fix — known issue in codebase (no rate limiting on endpoints). Apply to `/api/bookings` and `/api/contact` |
| `zod` | ^3.24 | Runtime input validation | Validate booking form inputs on server before DB write or calendar event creation; pairs well with TypeScript |
| `google-auth-library` | ^9 | Google OAuth2 token management | Already bundled inside `googleapis` — do not install separately; used for service account or OAuth2 credential flow |

### Development Tools (New)

| Tool | Purpose | Notes |
|------|---------|-------|
| `@types/express-rate-limit` | Type safety for rate limiter | Install as dev dep alongside `express-rate-limit` |
| Tailwind IntelliSense (VS Code) | Autocomplete for Tailwind classes | Install `bradlc.vscode-tailwindcss` extension; essential for dark theme class authoring |

---

## Installation

```bash
# Core new dependencies
npm install tailwindcss @tailwindcss/vite googleapis clsx tailwind-merge

# Booking UI + date handling
npm install react-day-picker date-fns

# API hardening
npm install express-rate-limit zod
```

Note: `google-auth-library` is NOT installed separately — it ships inside `googleapis`.

---

## Google Calendar Integration: Approach Decision

**Use OAuth2 with a Service Account or stored refresh token — NOT user-facing OAuth flow.**

The trainer is the only calendar owner. The app acts as a server-side agent that:
1. Reads the trainer's calendar to find free/busy slots (Google Calendar FreeBusy API)
2. Writes new booking events when a client submits

**Recommended credential approach: OAuth2 with stored refresh token**

1. Trainer completes OAuth2 consent once (via a one-time script or setup route)
2. Access token + refresh token stored in `.env` (or a secure secret store)
3. Server refreshes tokens automatically via `googleapis` OAuth2 client
4. No ongoing OAuth flow needed per request

**Why not a Service Account:** Service accounts require domain-wide delegation to access a personal Google Calendar, which requires Google Workspace. A personal Gmail trainer account cannot grant service account access to their calendar. OAuth2 with a stored refresh token is the correct approach for personal Google accounts.

**Scopes required:**
- `https://www.googleapis.com/auth/calendar.readonly` — read availability
- `https://www.googleapis.com/auth/calendar.events` — create booking events

---

## Tailwind Component Library Decision

**Recommendation: No component library. Use Tailwind utility classes directly.**

For this project, a component library would add friction without benefit:

| Library | Verdict | Reason |
|---------|---------|--------|
| shadcn/ui | Skip for now | Excellent library but requires `@radix-ui` primitives + opinionated setup; adds complexity for a site that mostly needs marketing sections, not a full design system |
| Headless UI | Consider later | Useful for accessible modal/dropdown; but this project's interaction surface is small (booking modal, date picker) |
| DaisyUI | Avoid | Opinionated class-based system conflicts with handwriting Tailwind for a custom dark gym aesthetic |
| Flowbite | Avoid | JS-heavy, not React-native; unnecessary |

The dark, high-energy gym aesthetic is best achieved with hand-crafted Tailwind — picking a component library locks you into that library's aesthetic DNA. Build the design from scratch using Tailwind.

**If you later need accessible modals or dropdowns:** Add Headless UI (`@headlessui/react`) then. It has zero styles and works with any Tailwind design.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `googleapis` | Separate REST calls to Google Calendar API using `fetch` | Only if you want zero dependencies and are comfortable handling OAuth token refresh manually. `googleapis` handles token refresh automatically, making it the better choice here. |
| `react-day-picker` | `react-datepicker` | `react-datepicker` is older, harder to style with Tailwind. Use `react-day-picker` unless you need time selection built-in (you don't — time slots are custom). |
| `date-fns` | `dayjs` | Either works. `date-fns` is the official peer dep of `react-day-picker` v9, so install it rather than fighting the ecosystem. |
| `zod` | Manual validation + TypeScript types | Zod provides runtime safety that TypeScript cannot; never validate only at compile time for user inputs. |
| Tailwind v4 | Tailwind v3 | Tailwind v3 still works but v4 is the current release and integrates directly with Vite via the plugin — no PostCSS config needed. Use v4. |
| OAuth2 refresh token | Service Account | Service accounts only work with Google Workspace. Personal Gmail accounts cannot use them for calendar access. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `moment.js` | Deprecated; enormous bundle size; mutable API | `date-fns` (tree-shakeable, immutable, TypeScript-native) |
| `@fullcalendar/react` | Heavy (multiple packages, ~200KB); overkill for a time-slot picker | `react-day-picker` for date selection + custom slot grid component |
| `Calendly embed` | Third-party dependency; breaks the Google Calendar two-way sync requirement; not customizable for dark gym aesthetic | Build the booking flow natively |
| `next-auth` | Designed for Next.js; does not fit Express backend | `googleapis` OAuth2 client directly |
| `passport-google-oauth20` | User-facing OAuth flow designed for multi-user login; wrong tool for server-to-server calendar access | `googleapis` with stored refresh token |
| `@prisma/client` (old import path) | Prisma 7 changed the generator — this import path is for old setups | Import from `../generated/prisma` as configured in `schema.prisma` |
| `styled-components` or `emotion` | CSS-in-JS; conflicts with Tailwind-only mandate from CLAUDE.md | Tailwind utility classes only |
| Inline `style={{}}` props | Also conflicts with CLAUDE.md mandate | Tailwind utility classes only |

---

## Stack Patterns by Variant

**For booking slot rendering:**
- Use custom React component with Tailwind grid, not a full calendar library
- Time slots as buttons, disabled state for unavailable (queried from Google Calendar FreeBusy API)
- Date navigation uses `react-day-picker` for the calendar day selection

**For Google Calendar read (check availability):**
- Call Google Calendar FreeBusy API from the Express backend
- Never expose Google credentials to the frontend
- Frontend calls `/api/availability?date=YYYY-MM-DD` and gets back available slots

**For Google Calendar write (create booking):**
- On booking confirm, Express creates a Calendar event with attendee (client email)
- Google sends a calendar invite to the trainer automatically
- Store booking record in Prisma `Booking` model alongside the Calendar event ID

**For Tailwind v4 Vite setup:**
```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default {
  plugins: [react(), tailwindcss()]
}
```
No `tailwind.config.js` required for v4 basic use.

---

## Version Compatibility Notes

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `tailwindcss@^4.1` | Vite 7.x | Use `@tailwindcss/vite` plugin — NOT PostCSS integration |
| `react-day-picker@^9` | React 19 | v9 targets React 18+; fully compatible with React 19 |
| `date-fns@^4` | `react-day-picker@^9` | Required peer dep; v4 is current |
| `googleapis@^144` | Node.js 18+ | Current major; TypeScript types bundled |
| `express-rate-limit@^7` | Express 5.x | Compatible; middleware signature unchanged |
| `zod@^3.24` | TypeScript 5.x | Current stable; TypeScript 5 support is full |
| `prisma@^7.4.2` | `@prisma/adapter-pg@^7.4.2` | Must stay in sync — always upgrade together |

---

## Environment Variables Required (New)

```env
# Google Calendar OAuth2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=          # Stored after one-time OAuth2 consent
GOOGLE_CALENDAR_ID=primary     # 'primary' for the trainer's main calendar

# Existing (already present)
RESEND_API=
TRAINER_EMAIL=
DATABASE_URL=
```

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Google Calendar API approach (OAuth2 + refresh token) | HIGH | This is the officially documented approach for personal Google account server-side access; well-established pattern |
| `googleapis` library recommendation | HIGH | Official Google-maintained library; no real alternative for Node.js |
| Tailwind v4 + Vite plugin integration | MEDIUM | Tailwind v4 released in early 2025; Vite plugin is the documented integration; exact version numbers not verified via Context7 due to tool unavailability |
| `react-day-picker` v9 | MEDIUM | Actively maintained, good Tailwind compatibility, but exact v9 API not verified via Context7 |
| `date-fns` v4 | MEDIUM | Known current major version; well-established in ecosystem |
| Prisma 7 generator import path | HIGH | Directly read from `schema.prisma` in this codebase — confirmed fact |
| No component library recommendation | HIGH | Design intent (dark gym aesthetic) + CLAUDE.md mandate (Tailwind only) clearly rule out component libraries |

---

## Sources

- `prisma/schema.prisma` — confirmed Prisma 7 generator config and import path
- `package.json` — confirmed all installed versions as of 2026-03-11
- `server/index.ts`, `server/services/emailService.ts` — confirmed existing server architecture
- Google Identity platform documentation (training knowledge, HIGH confidence) — OAuth2 for personal calendar access requires stored refresh token, not service account
- Google Calendar API v3 documentation (training knowledge, MEDIUM confidence) — FreeBusy endpoint for availability, Events.insert for booking creation
- Tailwind CSS v4 documentation (training knowledge, MEDIUM confidence) — Vite plugin integration, no config file required

---
*Stack research for: PT App — Google Calendar booking integration*
*Researched: 2026-03-11*
