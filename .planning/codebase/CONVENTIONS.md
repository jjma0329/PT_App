# Coding Conventions

**Analysis Date:** 2026-03-11

## Naming Patterns

**Files:**
- Server-side: camelCase for files within directories (`contactController.ts`, `emailService.ts`, `contact.ts`)
- Frontend scripts: camelCase (`script.ts`)
- CSS files: kebab-case by section (`base.css`, `about.css`, `footer.css`, `responsive.css`)
- Prisma schema: `schema.prisma` (lowercase)

**Functions:**
- Exported async functions use camelCase verbs: `createContact`, `sendContactAlert`
- DOM-interacting functions use camelCase verbs: `closeModal`
- Controller functions named after action + resource noun: `createContact`
- Service functions named after action: `sendContactAlert`

**Variables:**
- camelCase throughout (`submitBtn`, `contactForm`, `formSuccess`)
- DOM element variables named after their role (`modal`, `closeModalBtn`, `navbar`)
- Constants at module level use camelCase (`adapter`, `prisma`, `resend`, `router`)

**Types/Interfaces:**
- PascalCase for interfaces: `ContactDetails`
- No type aliases observed — only interfaces

**Routes:**
- Resource-based URL segments: `/api/contact`
- Router variable named `router` (Express Router pattern)

## Code Style

**Formatting:**
- No Prettier config detected — formatting is manual/editor-driven
- Consistent 2-space indentation throughout server files
- 4-space indentation in `src/script.ts` (DOM script)

**Linting:**
- ESLint 9 with flat config (`eslint.config.js`)
- Rules: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` recommended + `eslint-plugin-react-refresh`
- Applies to `**/*.{ts,tsx}` only
- TypeScript strict mode enabled (`tsconfig.app.json`): `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`

## Import Organization

**Order (observed in server files):**
1. External framework/library imports (e.g., `import { Request, Response } from 'express'`)
2. Internal project imports (e.g., `import { PrismaClient } from '../../src/generated/...'`)
3. Local service/utility imports (e.g., `import { sendContactAlert } from '../services/emailService.ts'`)

**Import style:**
- Named imports preferred: `{ Request, Response }`, `{ Router }`, `{ Resend }`
- Default imports for routers and app instances: `import express from 'express'`
- `.ts` extensions included in server-side imports (`'../services/emailService.ts'`)
- `.js` extensions used in route imports from `server/index.ts` (`'./routes/contact.js'`) — mixed extension convention

**Path Aliases:**
- None configured — relative paths used throughout

## Error Handling

**Backend controller pattern:**

```typescript
// Early return for validation errors
if (!name || !email) {
  res.status(400).json({ success: false, error: 'Name and email are required.' });
  return;
}

// try/catch wraps all async operations
try {
  const submission = await prisma.contactSubmission.create({ ... });
  res.status(201).json({ success: true, data: submission });
} catch (err) {
  res.status(500).json({ success: false, error: 'Failed to save submission.' });
}
```

**Response shape (consistent):**
- Success: `{ success: true, data: <payload> }`
- Error: `{ success: false, error: '<message>' }`

**Frontend DOM pattern:**

```typescript
try {
  const res = await fetch('/api/contact', { ... });
  if (!res.ok) throw new Error('Server error');
  // success path
} catch {
  // reset UI state
  alert('Something went wrong. Please try again.');
}
```

## Logging

- `console.log` present in `server/index.ts` (startup message only)
- No structured logging library in use
- Controllers do not log errors — errors are swallowed after sending HTTP response

## Comments

- Section comments used in `src/script.ts` to divide DOM logic: `/* Modal Logic */`, `/* Menu Toggle */`, `/* Typing Text */`
- No JSDoc/TSDoc comments observed on exported functions
- Inline comments not used

## Function Design

**Size:** Functions are short and single-purpose — `createContact` is 19 lines, `sendContactAlert` is 16 lines
**Parameters:** Controllers use destructuring from `req.body` immediately at function top
**Return Values:** Controller functions return `Promise<void>` — responses sent via `res.json()`
**Early returns:** Used for validation guards before the main try/catch block

## Module Design

**Exports:**
- Named exports for controller functions: `export async function createContact(...)`
- Named exports for service functions: `export async function sendContactAlert(...)`
- Default export for Express routers: `export default router`

**Barrel Files:** None — direct imports from specific files

## TypeScript Usage

- Non-null assertions (`!`) used for env vars: `process.env.DATABASE_URL!`, `process.env.TRAINER_EMAIL!`
- Type casting with `as` for DOM elements: `document.getElementById('modal') as HTMLElement`
- Interface used to type service function parameters: `ContactDetails`
- Optional properties with `?` and `null` fallback: `phone?: string | null`

---

*Convention analysis: 2026-03-11*
