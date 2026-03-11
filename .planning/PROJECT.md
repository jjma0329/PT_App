# PT App — Personal Trainer Website

## What This Is

A full-stack personal trainer marketing and booking website. Visitors can learn about the trainer's services and pricing, then book a session directly on the site. The trainer manages availability via Google Calendar and receives booking notifications by email. Built with React + Tailwind frontend, Express + TypeScript backend, Prisma + Neon PostgreSQL database.

## Core Value

A visitor can discover the trainer, be impressed by the site, and book a session in under 2 minutes.

## Requirements

### Validated

- ✓ Static marketing sections (hero, about, services, pricing plans, reviews, footer) — existing
- ✓ Contact form that saves to DB and sends email via Resend — existing
- ✓ Express REST API with routes → controllers → services pattern — existing
- ✓ Prisma ORM connected to Neon PostgreSQL — existing
- ✓ Vite build tooling with TypeScript — existing

### Active

- [ ] Rebuild frontend in React + Tailwind (migrate from vanilla HTML/CSS/TypeScript)
- [ ] Dark, high-energy UI design system (bold typography, high-contrast, gym aesthetic)
- [ ] Client booking flow: pick time slot → fill form → confirmation
- [ ] Google Calendar two-way sync (read availability, write new bookings as events)
- [ ] Booking email notifications via Resend (confirmation to client + alert to trainer)
- [ ] Bookings saved to database (Prisma model)
- [ ] Iterative visual improvements over time

### Out of Scope

- Client login / account system — not needed for v1; simple booking requires no auth
- Admin dashboard UI — trainer manages via Google Calendar directly
- Payment processing — out of scope for v1
- Mobile app — web-first
- Real-time chat — not needed

## Context

**Existing codebase state:**
- Frontend is currently vanilla HTML/CSS/TypeScript — needs to be rebuilt in React + Tailwind per project standards
- 10 handwritten CSS files will be replaced by Tailwind utility classes
- Backend Express server already structured with routes/controllers/services layers
- `ContactSubmission` Prisma model and migration already exist
- Resend email service already wired up

**Tech stack (target):**
- Frontend: React (functional components), Tailwind CSS, TypeScript, Vite
- Backend: Express, TypeScript, tsx for dev
- Database: Prisma ORM, Neon PostgreSQL (`@prisma/adapter-pg`)
- Email: Resend
- Calendar: Google Calendar API (OAuth2)
- Dev deployment: localhost + ngrok tunnel

**Known issues to address (from codebase map):**
- No rate limiting on API endpoints
- Wildcard CORS (needs tightening)
- No input sanitization for email HTML content
- No `postinstall` script for `prisma generate`
- Duplicate `id="star"` HTML attributes in reviews section

## Constraints

- **Tech stack**: React + Tailwind + TypeScript + Express + Prisma + Neon — locked per CLAUDE.md
- **Deploy**: localhost + ngrok initially, production deployment later
- **No accounts**: v1 booking requires no user registration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Extend existing site (not rebuild from scratch) | Backend and DB work is solid; only frontend needs replacing | — Pending |
| Google Calendar two-way sync | Trainer already uses Google Calendar; avoids building a custom availability manager | — Pending |
| No client accounts for v1 | Keeps booking simple; most PT clients book via simple form anyway | — Pending |
| Ngrok for initial deployment | Fast path to shareable URL without full hosting setup | — Pending |

---
*Last updated: 2026-03-11 after initialization*
