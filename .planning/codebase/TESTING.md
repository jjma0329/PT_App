# Testing Patterns

**Analysis Date:** 2026-03-11

## Test Framework

**Runner:**
- None detected — no test framework is installed or configured

**Assertion Library:**
- None

**Run Commands:**
```bash
# No test commands configured in package.json
# Scripts available: dev, server, build, lint, preview
```

## Test File Organization

**Location:**
- No test files exist in the codebase

**Naming:**
- No convention established

**Structure:**
- Not applicable

## Test Structure

**Suite Organization:**
- Not applicable — no tests written

## Mocking

**Framework:** Not applicable

## Fixtures and Factories

**Test Data:** Not applicable

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# Not configured
```

## Test Types

**Unit Tests:**
- Not present

**Integration Tests:**
- Not present

**E2E Tests:**
- Not present

## Recommended Setup (for future implementation)

Based on the stack (Vite frontend, Express backend, TypeScript), the conventional testing setup for this project would be:

**Frontend (Vite + React):**
- Runner: Vitest (`vitest`) — native Vite integration, same config file
- DOM environment: `@vitest/browser` or `jsdom`
- Component testing: `@testing-library/react`
- Config file: `vitest.config.ts`

**Backend (Express + TypeScript):**
- Runner: Vitest or Jest with `ts-jest`
- HTTP testing: `supertest` for route/controller integration tests
- Mocking: `vi.mock()` (Vitest) or `jest.mock()` (Jest)

**What to test first (highest value):**
- `server/controllers/contactController.ts` — input validation branches, success/error paths
- `server/services/emailService.ts` — Resend API call with mocked client
- `src/script.ts` — form submission flow (fetch mock, modal state)

**Example controller test pattern (Vitest + Supertest):**
```typescript
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../server/index';

describe('POST /api/contact', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/contact').send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Name and email are required.' });
  });
});
```

---

*Testing analysis: 2026-03-11*
