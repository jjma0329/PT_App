# External Integrations

**Analysis Date:** 2026-03-11

## APIs & External Services

**Email:**
- Resend - Sends transactional email alerts to the trainer when a contact form is submitted
  - SDK/Client: `resend` npm package ^6.9.3
  - Implementation: `server/services/emailService.ts`
  - Auth: `RESEND_API` environment variable
  - Sender: `JJM Fitness <onboarding@resend.dev>` (Resend sandbox domain)
  - Recipient: `TRAINER_EMAIL` environment variable

**CDN Libraries (unpkg):**
- AOS (Animate On Scroll) - CSS/JS loaded from `https://unpkg.com/aos@next/dist/`
- Typed.js - JS loaded from `https://unpkg.com/typed.js@3.0.0/dist/typed.umd.js`
- Boxicons - CSS loaded from `https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css`

## Data Storage

**Databases:**
- PostgreSQL via Neon (serverless Postgres) - inferred from `@prisma/adapter-pg` driver-adapter pattern and project commit history
  - Connection: `DATABASE_URL` environment variable (full connection string)
  - Client: Prisma ORM v7 with `PrismaPg` driver adapter
  - Schema: `prisma/schema.prisma`
  - Migrations: `prisma/migrations/`
  - Client instantiation: `server/controllers/contactController.ts`

```typescript
// Pattern used in server/controllers/contactController.ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

**File Storage:**
- Local filesystem only (static images in `src/assets/`)

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None - no user authentication exists in this codebase

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- `console.log` used in `server/index.ts` for startup confirmation only

## CI/CD & Deployment

**Hosting:**
- Not specified in codebase

**CI Pipeline:**
- None configured

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string (used by Prisma and `PrismaPg` adapter)
- `RESEND_API` - API key for Resend email service
- `TRAINER_EMAIL` - Email address to receive contact form alert notifications
- `PORT` - Optional; Express server port (defaults to 3001)

**Secrets location:**
- Environment variables only; no `.env` file is committed to the repository

## Webhooks & Callbacks

**Incoming:**
- `POST /api/contact` - Contact form submission endpoint (`server/routes/contact.ts`)
  - Validates `name` and `email` fields
  - Persists to database via Prisma
  - Triggers Resend email alert to trainer

**Outgoing:**
- Resend API call on each contact form submission (`server/services/emailService.ts`)

---

*Integration audit: 2026-03-11*
