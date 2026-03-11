# Architecture

**Analysis Date:** 2026-03-11

## Pattern Overview

**Overall:** Vanilla HTML/CSS/TypeScript frontend with a Node.js + Express REST API backend. The frontend is a single-page static site served by Vite. The backend is a separate Express server handling API routes.

**Key Characteristics:**
- Single HTML file frontend (`index.html`) with modular CSS and one TypeScript entry script
- Express backend with a routes → controllers → services layering pattern
- Vite dev server proxies `/api` requests to the Express server on port 3001
- No React components yet — React is installed as a dependency but the current frontend is vanilla DOM manipulation
- Prisma ORM connects to a Neon PostgreSQL database via the `@prisma/adapter-pg` driver

## Layers

**Presentation Layer:**
- Purpose: Renders the single-page fitness trainer website with sections for Home, Services, About, Plans, Reviews, and Footer
- Location: `index.html`, `css/`, `src/script.ts`
- Contains: Static HTML markup, modular CSS files per section, TypeScript for DOM interactivity (modal, nav toggle, typed text animation)
- Depends on: CDN-loaded AOS (scroll animations), Typed.js (typewriter effect), Boxicons (icon font)
- Used by: End users in browser

**API Route Layer:**
- Purpose: Declares HTTP routes and maps them to controller functions
- Location: `server/routes/contact.ts`
- Contains: Express Router instances with HTTP method and path bindings
- Depends on: Controller functions
- Used by: Express app in `server/index.ts`

**Controller Layer:**
- Purpose: Handles HTTP request/response lifecycle, validates inputs, and orchestrates business logic
- Location: `server/controllers/contactController.ts`
- Contains: Async request handler functions, input validation, Prisma calls, response formatting
- Depends on: Prisma client, service functions
- Used by: Route layer

**Service Layer:**
- Purpose: Encapsulates external integration calls (email sending)
- Location: `server/services/emailService.ts`
- Contains: Resend API client usage, email template construction
- Depends on: `resend` npm package, environment variables
- Used by: Controller layer

**Data Layer:**
- Purpose: Database schema definition and generated Prisma client
- Location: `prisma/schema.prisma`, `src/generated/prisma/` (generated output)
- Contains: `ContactSubmission` model, migration history in `prisma/migrations/`
- Depends on: Neon PostgreSQL via `DATABASE_URL` env var
- Used by: Controller layer via instantiated `PrismaClient`

## Data Flow

**Contact Form Submission:**

1. User clicks a "Book A Session" / "open-modal" button in `index.html`
2. `src/script.ts` intercepts the click and shows the `#contactModal` overlay
3. User fills and submits `#contactForm`
4. `src/script.ts` sends a `POST /api/contact` fetch request with JSON body `{ name, email, phone, goal, message }`
5. Vite dev proxy (or production reverse proxy) forwards the request to `http://localhost:3001`
6. `server/index.ts` routes the request to `server/routes/contact.ts`
7. `server/routes/contact.ts` calls `createContact` in `server/controllers/contactController.ts`
8. Controller validates required fields (`name`, `email`), returns 400 on failure
9. Controller calls `prisma.contactSubmission.create()` to persist the record in Neon PostgreSQL
10. Controller calls `sendContactAlert()` from `server/services/emailService.ts` to email the trainer via Resend
11. Controller returns `{ success: true, data: submission }` with HTTP 201
12. `src/script.ts` hides the form and shows the success state in the modal

**State Management:**
- No client-side state management library. State is managed via direct DOM class manipulation (e.g., `modal.classList.add('active')`, `formSuccess.classList.add('visible')`).

## Key Abstractions

**ContactSubmission (Prisma Model):**
- Purpose: Represents a single visitor inquiry/booking request stored in the database
- Examples: `prisma/schema.prisma` (definition), `server/controllers/contactController.ts` (usage)
- Pattern: Prisma model with auto-increment integer ID and `createdAt` timestamp

**Express Router Module:**
- Purpose: Encapsulates a set of related routes as a mountable mini-application
- Examples: `server/routes/contact.ts`
- Pattern: Create a `Router()`, attach handlers, export default

**Controller Function:**
- Purpose: Single async function per action; owns HTTP concern (req/res) and delegates to Prisma/services
- Examples: `createContact` in `server/controllers/contactController.ts`
- Pattern: `async (req: Request, res: Response): Promise<void>` with try/catch and consistent `{ success, data, error }` JSON responses

## Entry Points

**Frontend:**
- Location: `index.html`
- Triggers: Browser navigation / Vite dev server
- Responsibilities: Renders all page sections, loads CSS and third-party scripts, loads `src/script.ts` as an ES module

**Frontend Script:**
- Location: `src/script.ts`
- Triggers: Loaded as `<script type="module">` from `index.html`
- Responsibilities: Modal open/close logic, contact form fetch submission, mobile nav toggle, Typed.js initialization

**Backend:**
- Location: `server/index.ts`
- Triggers: `npm run server` (uses `tsx watch`)
- Responsibilities: Creates Express app, registers CORS and JSON middleware, mounts `/api/contact` router, starts HTTP listener on `PORT` (default 3001)

## Error Handling

**Strategy:** Early return on validation failure; try/catch wrapping all async database and email operations.

**Patterns:**
- Missing required fields → `res.status(400).json({ success: false, error: '...' })`
- Caught exceptions in async routes → `res.status(500).json({ success: false, error: '...' })`
- Frontend fetch errors → caught in `catch` block; alert shown to user; submit button re-enabled

## Cross-Cutting Concerns

**Logging:** `console.log` only in `server/index.ts` startup message. No structured logging in place.
**Validation:** Manual field presence checks in controller (`if (!name || !email)`). No schema validation library.
**Authentication:** None. The contact endpoint is fully public.
**CORS:** Enabled globally via `cors()` middleware with default settings (all origins) in `server/index.ts`.

---

*Architecture analysis: 2026-03-11*
