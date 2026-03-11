# Technology Stack

**Analysis Date:** 2026-03-11

## Languages

**Primary:**
- TypeScript ~5.9.3 - All frontend and backend source code
- HTML5 - Single static page (`index.html`)

**Secondary:**
- CSS - Modular stylesheets in `css/` directory (no CSS preprocessor)

## Runtime

**Environment:**
- Node.js v18.19.1

**Package Manager:**
- npm 11.6.2
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Frontend:**
- React ^19.2.0 - UI framework (currently minimal usage; main UI is vanilla HTML + CSS + TypeScript in `src/script.ts`)
- React DOM ^19.2.0 - DOM renderer

**Backend:**
- Express ^5.2.1 - HTTP server and routing
- cors ^2.8.6 - Cross-origin request handling

**Build/Dev:**
- Vite ^7.3.1 - Frontend dev server and build tool (`vite.config.ts`)
- tsx ^4.21.0 - TypeScript execution for Node (used with `tsx watch` for backend dev server)
- `@vitejs/plugin-react` ^5.1.1 - Vite plugin for React/JSX transforms

## Key Dependencies

**Critical:**
- `@prisma/client` ^7.4.2 - Database ORM client (generated to `src/generated/prisma/`)
- `@prisma/adapter-pg` ^7.4.2 - PostgreSQL adapter for Prisma 7 driver-adapters pattern
- `resend` ^6.9.3 - Transactional email SDK for contact form alerts
- `dotenv` ^17.3.1 - Environment variable loading

**CDN-loaded (not in package.json):**
- AOS (Animate On Scroll) - loaded via `https://unpkg.com/aos@next/dist/` in `index.html`
- Typed.js ^3.0.0 - Typewriter effect, loaded via `https://unpkg.com/typed.js@3.0.0/` in `index.html`
- Boxicons 2.1.4 - Icon library, loaded via `https://unpkg.com/boxicons@2.1.4/` in `index.html`

**Dev Tooling:**
- ESLint ^9.39.1 with `typescript-eslint` ^8.48.0 - Linting
- `eslint-plugin-react-hooks` ^7.0.1 - Hooks rules enforcement
- `eslint-plugin-react-refresh` ^0.4.24 - HMR safety rules
- TypeScript - strict mode enabled, targets ES2022 (app) / ES2023 (node)
- prisma ^7.4.2 - CLI for migrations and schema management

## Configuration

**Environment:**
- No `.env` file committed; configuration loaded via `dotenv` at server startup
- Required env vars: `DATABASE_URL` (PostgreSQL connection string), `RESEND_API` (Resend API key), `TRAINER_EMAIL` (recipient email), `PORT` (optional, defaults to 3001)
- Prisma config: `prisma.config.ts` reads `DATABASE_URL` from environment

**Build:**
- `vite.config.ts` - Vite configuration; proxies `/api` to `http://localhost:3001`
- `tsconfig.json` - Root tsconfig referencing `tsconfig.app.json` and `tsconfig.node.json`
- `tsconfig.app.json` - Frontend compiler options (target ES2022, strict, no emit)
- `tsconfig.node.json` - Node/Vite config compiler options (target ES2023, strict, no emit)
- `eslint.config.js` - Flat ESLint config with TypeScript and React plugins
- `prisma/schema.prisma` - Database schema definition
- `prisma.config.ts` - Prisma CLI configuration

## Platform Requirements

**Development:**
- Node.js ≥18 required
- Two processes needed: `npm run dev` (Vite frontend) and `npm run server` (Express backend)
- Backend serves on port 3001; Vite proxies `/api` requests to it

**Production:**
- Frontend: static build via `npm run build` (tsc + vite build)
- Backend: Node.js process running `server/index.ts` via tsx or compiled JS
- Deployment target: not specified in codebase

---

*Stack analysis: 2026-03-11*
