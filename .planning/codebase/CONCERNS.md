# Codebase Concerns

## Critical Issues

### 1. Architecture Mismatch — React Installed but Not Used
- **Severity:** High
- **Location:** `index.html`, `src/script.ts`, `package.json`
- **Issue:** `CLAUDE.md` mandates React functional components + Tailwind CSS, but the frontend is entirely vanilla HTML/CSS/TypeScript. React is listed in dependencies but never imported or used.
- **Impact:** Fundamental disconnect between intended and actual architecture. Any new UI work per CLAUDE.md rules will require rebuilding the frontend.

### 2. No Tailwind CSS — 10 Hand-Written CSS Files Instead
- **Severity:** High
- **Location:** `css/` directory (10 files)
- **Issue:** CLAUDE.md mandates Tailwind utility classes only, but the project uses 10 separate handwritten CSS files (`base.css`, `header.css`, `footer.css`, `home.css`, `about.css`, `services.css`, `plans.css`, `reviews.css`, `contact.css`, `responsive.css`).
- **Impact:** Violates project conventions. New features will conflict in style approach.

### 3. Security — No Input Escaping in HTML Emails
- **Severity:** High
- **Location:** `server/services/emailService.ts`, `server/controllers/contactController.ts`
- **Issue:** User-supplied input (name, message) is interpolated directly into HTML email bodies without escaping, enabling HTML/script injection in email clients.
- **Impact:** Potential XSS in email clients, email content manipulation.

### 4. Security — Wildcard CORS
- **Severity:** Medium
- **Location:** `server/index.ts`
- **Issue:** CORS configured with `origin: '*'` allowing any domain to make requests to the API.
- **Impact:** No meaningful cross-origin protection for the contact endpoint.

### 5. Security — No Rate Limiting on Contact Endpoint
- **Severity:** Medium
- **Location:** `server/routes/contact.ts`
- **Issue:** The `/api/contact` endpoint has no rate limiting, allowing spam or abuse.
- **Impact:** Unlimited email sending via Resend, potential cost/abuse vector.

## Bugs

### 6. Error Handling Bug — DB Save Success but Email Fail Returns 500
- **Severity:** Medium
- **Location:** `server/controllers/contactController.ts`
- **Issue:** If the contact record saves to the DB successfully but the Resend email fails, the user receives a 500 error even though their submission was recorded.
- **Impact:** User confusion; data is saved but they're told it failed, likely causing duplicate submissions.

### 7. Duplicate HTML IDs on Star Rating Icons
- **Severity:** Low
- **Location:** `index.html` (reviews section)
- **Issue:** All star rating SVG icons share `id="star"` — IDs must be unique in HTML.
- **Impact:** Invalid HTML; JavaScript/CSS targeting by ID is unreliable.

## Technical Debt

### 8. Fragile Prisma Setup — Hardcoded Generated Client Path
- **Severity:** Medium
- **Location:** `prisma/schema.prisma`, server imports
- **Issue:** Generated Prisma client uses a relative `output` path. No `postinstall` script runs `prisma generate`, so fresh installs (`npm install`) won't have the generated client.
- **Impact:** New developers or CI environments will get import errors without a manual `npx prisma generate`.

### 9. CDN Dependency — AOS Loaded with `@next` (Non-Deterministic)
- **Severity:** Low
- **Location:** `index.html`
- **Issue:** AOS (Animate On Scroll) is loaded from CDN with `@next` tag, which resolves to whatever "next" is at load time — not pinned version.
- **Impact:** Breaking changes could appear unexpectedly on page load.

### 10. CDN Dependency — Typed.js Not in package.json
- **Severity:** Low
- **Location:** `index.html`, `src/script.ts`
- **Issue:** Typed.js is used in `script.ts` but loaded via CDN rather than installed as a dependency, bypassing the package manager.
- **Impact:** Version drift, offline failure, TypeScript type definitions absent.

### 11. Placeholder Content in Reviews
- **Severity:** Low
- **Location:** `index.html` (reviews section)
- **Issue:** Review text contains "review here review here" placeholder content.
- **Impact:** Unprofessional if deployed; indicates section is incomplete.

## Test Coverage

### 12. Zero Test Coverage
- **Severity:** Medium
- **Location:** Entire codebase
- **Issue:** No test framework configured (no Jest, Vitest, or any test runner). No test files exist anywhere.
- **Impact:** No regression safety net for backend API, email service, or any frontend logic.

## Summary

| Category | Count | Highest Severity |
|----------|-------|-----------------|
| Architecture | 2 | High |
| Security | 3 | High |
| Bugs | 2 | Medium |
| Tech Debt | 4 | Medium |
| Testing | 1 | Medium |

**Most urgent:** The React/Tailwind architecture mismatch is a blocker for building new features per CLAUDE.md rules. Address this before adding features.

---
*Mapped: 2026-03-11*
