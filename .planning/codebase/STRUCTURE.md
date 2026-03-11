# Codebase Structure

## Directory Layout

```
PT_App/
├── index.html              # Single-page HTML entry point (vanilla, not React)
├── css/                    # Hand-written CSS files (10 files)
│   ├── base.css            # Global resets and base styles
│   ├── header.css          # Navigation/header styles
│   ├── footer.css          # Footer styles
│   ├── home.css            # Hero section styles
│   ├── about.css           # About section styles
│   ├── services.css        # Services section styles
│   ├── plans.css           # Pricing plans styles
│   ├── reviews.css         # Reviews/testimonials styles
│   ├── contact.css         # Contact modal styles
│   └── responsive.css      # Media query overrides
├── src/
│   ├── assets/             # Images (hero, about, gallery photos)
│   │   ├── heroImage.png
│   │   ├── about.jpg
│   │   ├── 1.jpg–3.jpg     # Gallery images
│   │   └── image1–5.jpg    # Additional gallery images
│   └── script.ts           # Frontend TypeScript (contact form, AOS, Typed.js)
├── server/                 # Express backend (TypeScript)
│   ├── index.ts            # Server entry point
│   ├── controllers/
│   │   └── contactController.ts  # Contact form handler
│   ├── routes/
│   │   └── contact.ts      # POST /api/contact route
│   └── services/
│       └── emailService.ts # Resend email service wrapper
├── prisma/                 # Database schema and migrations
│   ├── schema.prisma       # Prisma schema (Neon/PostgreSQL)
│   └── migrations/         # SQL migration history
├── prisma.config.ts        # Prisma client config with pg adapter
├── vite.config.ts          # Vite bundler config
├── tsconfig.json           # Root TypeScript config
├── tsconfig.app.json       # Frontend TS config
├── tsconfig.node.json      # Node/server TS config
├── eslint.config.js        # ESLint config
├── package.json            # Dependencies and scripts
└── CLAUDE.md               # Project instructions for Claude
```

## Key Locations

| Purpose | Path |
|---------|------|
| Frontend entry | `index.html` |
| Frontend logic | `src/script.ts` |
| All styles | `css/*.css` |
| Server entry | `server/index.ts` |
| API routes | `server/routes/` |
| Business logic | `server/controllers/` |
| Email sending | `server/services/emailService.ts` |
| DB schema | `prisma/schema.prisma` |
| Static assets | `src/assets/` |

## Naming Conventions

- **Backend files**: camelCase (`contactController.ts`, `emailService.ts`)
- **CSS files**: lowercase, section-named (`about.css`, `home.css`)
- **Assets**: descriptive lowercase (`heroImage.png`, `about.jpg`)
- **TypeScript configs**: split by context (app, node, root)

## Frontend Structure

The frontend is a **single-page vanilla HTML/CSS/TypeScript** app — not React. Despite React being in `package.json` and `CLAUDE.md` mandating React + Tailwind, no React components exist. All UI is in `index.html` with styles split across 10 CSS files.

The `src/script.ts` handles:
- Contact form modal open/close
- Form submission via `fetch` to backend API
- AOS (Animate On Scroll) initialization
- Typed.js text animation

## Backend Structure

Express server with three-layer pattern:
- `routes/` — URL routing only
- `controllers/` — Request handling and response
- `services/` — External service wrappers (email)

---
*Mapped: 2026-03-11*
