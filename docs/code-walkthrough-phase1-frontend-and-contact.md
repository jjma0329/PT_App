# Code Walkthrough — Phase 1: React Frontend + Contact Form

---

## Overview

Phase 1 built the entire public-facing website and the first working backend feature: a contact form that saves submissions to the database and emails the trainer.

Files covered:
- `src/main.tsx` — app entry point
- `src/App.tsx` — root component and modal state
- `src/lib/utils.ts` — shared `cn()` utility
- `src/components/Header.tsx` — fixed nav with mobile hamburger
- `src/components/HeroSection.tsx` — animated typing effect hero
- `src/components/ContactModal.tsx` — form with loading/success/error states
- `server/lib/prisma.ts` — database client setup
- `server/services/emailService.ts` — email notification via Resend
- `server/controllers/contactController.ts` — validation + DB save + email
- `server/routes/contact.ts` — route registration

---

## `src/main.tsx` — App Entry Point

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**What it does:**
This is the very first file that runs. It finds the `<div id="root">` in `index.html`, takes control of it, and renders the entire React app inside it.

- `createRoot` — React 18's way of mounting an app. Enables concurrent features under the hood.
- `StrictMode` — a development-only wrapper that intentionally runs certain code twice to help catch bugs (like missing cleanup in `useEffect`). Has zero effect in production builds.
- The `!` after `getElementById('root')` — tells TypeScript "trust me, this element exists." Without it, TypeScript would complain that `getElementById` might return `null`.

---

## `src/lib/utils.ts` — The `cn()` Helper

```ts
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
```

**What it does:**
`cn()` is a tiny helper for building Tailwind class strings conditionally. You'll see it used throughout components.

**Why it exists:**
Tailwind classes are just strings, and sometimes you only want to apply a class based on a condition. Without a helper, you'd write messy template literals:

```tsx
// Without cn() — messy
className={`w-full py-3 ${isSubmitting ? 'bg-zinc-700 text-zinc-400' : 'bg-yellow-400 text-zinc-950'}`}

// With cn() — readable
className={cn(
  'w-full py-3',
  isSubmitting ? 'bg-zinc-700 text-zinc-400' : 'bg-yellow-400 text-zinc-950'
)}
```

`clsx` handles arrays, objects, and falsy values gracefully — it just joins the truthy class strings together.

---

## `src/App.tsx` — Root Component and Modal State

```tsx
export default function App() {
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <>
      <Header onOpenModal={openModal} />
      <main>
        <HeroSection onOpenModal={openModal} />
        <ServicesSection />
        <AboutSection onOpenModal={openModal} />
        <PlansSection onOpenModal={openModal} />
        <ReviewsSection />
      </main>
      <Footer />
      <ContactModal isOpen={modalOpen} onClose={closeModal} />
    </>
  );
}
```

**What it does:**
`App` is the root of the component tree — every other component lives inside it. It owns the modal's open/closed state and passes down the functions to control it.

**Why state lives here (not in each button):**
Multiple places can open the contact modal — the Header, the Hero, the About section, the Plans section. If each had their own `useState`, they'd each control a separate, independent modal. By lifting state up to `App`, there's one source of truth: one modal, controlled from one place, opened by any child that receives `onOpenModal` as a prop.

**The `<>...</>` fragment:**
React components must return a single element. `<>` (short for `<React.Fragment>`) groups children without adding an extra `<div>` to the DOM.

---

## `src/components/Header.tsx` — Navigation

```tsx
const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'About Me', href: '#about' },
  { label: 'Contact', href: null },   // null = opens modal, not a link
  { label: 'Review', href: '#review' },
];
```

**What it does:**
A fixed header that stays at the top of the page while scrolling. On mobile it collapses into a hamburger menu.

**The nav data array:**
Nav items are defined as a data array rather than repeated JSX. This is a common React pattern — when you have a list of similar things, define the data once and `.map()` over it. Adding a new nav item means adding one object to the array, not writing new JSX.

**`href: null` for Contact:**
Contact doesn't link to a section — it opens the modal. So we give it `href: null` as a flag. The `.map()` checks: if `href` exists, render an `<a>` tag; if not, render a `<button>` that calls `onOpenModal`.

```tsx
{navItems.map(({ label, href }) =>
  href ? (
    <a href={href} onClick={closeMenu}>...</a>
  ) : (
    <button onClick={handleContactClick}>...</button>
  )
)}
```

**Hamburger toggle:**
```tsx
const [menuOpen, setMenuOpen] = useState(false);

<button onClick={() => setMenuOpen(prev => !prev)}>
  <i className={cn('bx', menuOpen ? 'bx-x' : 'bx-menu')} />
</button>
```
`prev => !prev` flips the boolean — open becomes closed, closed becomes open. The icon switches between a hamburger (`bx-menu`) and an X (`bx-x`) based on state.

**`cn()` for responsive nav visibility:**
```tsx
className={cn(
  'absolute top-full left-0 right-0 bg-zinc-950',
  'md:static md:bg-transparent md:flex md:items-center md:gap-8',
  menuOpen ? 'block' : 'hidden md:flex'
)}
```
Three groups of classes:
1. Mobile layout (absolute positioning, dark background)
2. `md:` prefixed — desktop overrides (static, transparent, flex layout)
3. `menuOpen` controls visibility — hidden by default on mobile, shown when menu is open. `md:flex` ensures it's always visible on desktop regardless of `menuOpen`.

---

## `src/components/HeroSection.tsx` — Animated Typing Effect

```tsx
const typedRef = useRef<HTMLSpanElement>(null);

useEffect(() => {
  if (!typedRef.current) return;

  const typed = new Typed(typedRef.current, {
    strings: ['Physical Fitness', 'Weight Gain', 'Strength Training', 'Fat Loss', 'Weight Lifting'],
    typeSpeed: 60,
    backSpeed: 60,
    backDelay: 1000,
    loop: true,
  });

  return () => typed.destroy();
}, []);
```

**What it does:**
The animated text that cycles through fitness goals in the hero section.

**`useRef`:**
`useRef` gives us a direct reference to a real DOM element — in this case the `<span>` where the typed text appears. Typed.js needs a real DOM node to control, not a React abstraction.

**`useEffect` with empty `[]`:**
The `[]` dependency array means "run this once, after the component first appears on screen." This is the right time to initialize a third-party library that needs a DOM element to exist.

**The cleanup function `return () => typed.destroy()`:**
When the component is removed from the page (or in StrictMode, when React unmounts and remounts for testing), we destroy the Typed.js instance. Without this, Typed.js would keep running in the background even after the component is gone — a memory leak.

**`if (!typedRef.current) return`:**
A guard at the top of the effect. On the very first render, the ref might not be attached yet. This prevents a crash.

---

## `src/components/ContactModal.tsx` — The Contact Form

This is the most complex frontend component. It manages four pieces of state and three `useEffect`s.

### State

```tsx
const [formData, setFormData] = useState<FormData>(initialFormData);
const [isSubmitting, setIsSubmitting] = useState(false);
const [isSuccess, setIsSuccess] = useState(false);
const [error, setError] = useState<string | null>(null);
```

- `formData` — tracks every input field's current value
- `isSubmitting` — true while the API call is in-flight; disables the submit button
- `isSuccess` — when true, replaces the form with a success message
- `error` — holds an error string to display if the API call fails

### Three `useEffect`s

**1. Escape key to close:**
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [onClose]);
```
Adds a keyboard listener so pressing Escape closes the modal. The cleanup removes the listener when the component unmounts — without it, you'd accumulate duplicate listeners every time the modal opens.

**2. Body scroll lock:**
```tsx
useEffect(() => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
  return () => { document.body.style.overflow = ''; };
}, [isOpen]);
```
When the modal is open, the page behind it shouldn't scroll. Setting `overflow: hidden` on `<body>` locks scrolling. The cleanup restores normal scrolling when the modal closes or unmounts.

**3. Reset form after close:**
```tsx
useEffect(() => {
  if (!isOpen) {
    const timer = setTimeout(() => {
      setFormData(initialFormData);
      setIsSuccess(false);
      setError(null);
    }, 300);
    return () => clearTimeout(timer);
  }
}, [isOpen]);
```
When the modal closes, we wait 300ms before resetting the form. Why 300ms? The modal likely has a CSS fade-out animation. If we reset immediately, the form would visibly flash back to empty while still visible. The 300ms delay lets the animation finish first. The cleanup cancels the timer if the modal reopens before 300ms.

### Form input pattern

```tsx
onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
```

All inputs use the same pattern: spread the previous form state (`...prev`) and overwrite only the changed field. This keeps all other fields intact — you're updating one key in the object, not replacing the whole thing.

### `handleSubmit`

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();       // stop the browser from reloading the page
  setIsSubmitting(true);
  setError(null);

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!res.ok) throw new Error('Server error');

    setIsSuccess(true);
    setTimeout(() => onClose(), 2500);  // auto-close after 2.5s
  } catch {
    setError('Something went wrong. Please try again.');
  } finally {
    setIsSubmitting(false);  // always re-enable the button
  }
};
```

- `e.preventDefault()` — forms by default reload the page on submit. We stop that so React can handle it.
- `if (!res.ok) throw new Error(...)` — `fetch` doesn't throw on 4xx/5xx responses. We manually throw so the `catch` block handles API errors the same way as network errors.
- `finally` — runs whether the request succeeded or failed. Ensures the submit button is always re-enabled so the user can try again.

### Overlay click to close

```tsx
const handleOverlayClick = (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) onClose();
};
```

`e.target` is the element that was actually clicked. `e.currentTarget` is the element the handler is attached to (the dark overlay backdrop). If they're the same, the user clicked the backdrop itself — not something inside the modal — so we close it. This prevents the modal from closing when clicking inside the form.

### `cn()` for conditional button styles

```tsx
className={cn(
  'w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2',
  isSubmitting
    ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
    : 'bg-yellow-400 text-zinc-950 hover:bg-yellow-300'
)}
```

The first string is always applied (base styles). The second block conditionally applies either the disabled or active appearance based on `isSubmitting`.

---

## `server/lib/prisma.ts` — Database Client

```ts
import { PrismaClient } from '../../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const prisma = new PrismaClient({ adapter });
```

**What it does:**
Sets up the single database client that the entire backend uses.

- `PrismaPg` — Prisma's PostgreSQL adapter. It handles the actual TCP connection to the database using the connection string from `.env`.
- `PrismaClient` — Prisma's query builder. When you write `prisma.contactSubmission.create(...)`, it translates that into a SQL `INSERT` statement.
- **Singleton pattern** — this file is imported in multiple controllers. Node.js caches module imports, so this code runs once. Every import of `prisma` gets the same instance — you don't accidentally open hundreds of DB connections.

---

## `server/services/emailService.ts` — Email Notification

### `escapeHtml()` and `safeField()`

```ts
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeField(value: string | null | undefined): string {
  return value ? escapeHtml(value) : '—';
}
```

**What it does:**
`escapeHtml` sanitizes user-submitted text before putting it inside an HTML email. Without this, a user could type `<script>alert('xss')</script>` in the name field and it would execute when the email is opened — a classic XSS attack. Each replace converts the dangerous character to its HTML entity equivalent.

`safeField` wraps `escapeHtml` and handles optional fields — if the value is empty/null/undefined, it shows a dash (`—`) instead of blank.

### `sendContactAlert()`

```ts
export async function sendContactAlert(contact: ContactDetails): Promise<void> {
  await resend.emails.send({
    from: 'JJM Fitness <onboarding@resend.dev>',
    to: process.env.TRAINER_EMAIL!,
    subject: `New session booking — ${escapeHtml(contact.name)}`,
    html: `...table with contact details...`,
  });
}
```

**What it does:**
Sends an HTML email to the trainer whenever someone submits the contact form. Uses [Resend](https://resend.com) as the email delivery service.

- `from: 'onboarding@resend.dev'` — Resend's sandbox sender address, used for development. In production this would be a verified custom domain.
- `to: process.env.TRAINER_EMAIL!` — the trainer's email address, kept in `.env` so it's not hardcoded.
- All user fields are passed through `escapeHtml`/`safeField` before rendering in the HTML.

---

## `server/controllers/contactController.ts` — The Handler

```ts
export async function createContact(req: Request, res: Response): Promise<void> {
  const { name, email, phone, goal, message } = req.body;

  // Guard: name and email are required
  if (!name || !email) {
    res.status(400).json({ success: false, error: 'Name and email are required.' });
    return;
  }

  try {
    // Save to DB first — this is the important part
    const submission = await prisma.contactSubmission.create({
      data: { name, email, phone: phone || null, goal: goal || null, message: message || null },
    });

    // Then try to send the email — but don't fail the request if it breaks
    try {
      await sendContactAlert({ name, email, phone, goal, message });
    } catch {
      // Email failure is non-fatal — submission is already saved
    }

    res.status(201).json({ success: true, data: submission });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to save submission.' });
  }
}
```

**What it does:**
Validates the incoming form data, saves it to the database, and triggers an email alert.

**Early return pattern:**
The validation check returns immediately on failure. This avoids nesting the happy path inside an `else` block — the rest of the function only runs if validation passed.

**`phone: phone || null`:**
Optional fields from the form might come in as empty strings `""`. The database schema expects `null` for missing optional values, not empty strings. `phone || null` converts `""` (falsy) to `null`.

**Nested try/catch for email:**
The email send is wrapped in its own inner `try/catch`, separate from the DB save. This is intentional — if Resend is down or the API key is wrong, we don't want the form submission to fail. The contact is already saved to the DB (the important thing). The inner `catch` silently swallows the email error. The outer `try/catch` only covers DB failures, which are fatal.

**HTTP 201 vs 200:**
`201 Created` is the correct status code when a new resource is created on the server. `200 OK` means "the request worked." The distinction is semantic — both work, but `201` is more accurate here.

---

## `server/routes/contact.ts` — Route Registration

```ts
const router = Router();
router.post('/', createContact);
export default router;
```

**What it does:**
Registers one route: `POST /` handled by `createContact`. The `/` is relative — when this router is mounted in `server/index.ts` at `/api/contact`, the full path becomes `POST /api/contact`.

This separation of routes and controllers is a standard Express pattern:
- **Routes** — only define which URL + method maps to which controller function
- **Controllers** — contain the actual logic

Keeping them separate makes each file smaller and easier to test independently.

---

## Request Flow Summary

```
User fills form                 React (ContactModal)          Express Server              DB / Email
       |                               |                            |                        |
       |-- clicks "Send Message" ----->|                            |                        |
       |                               |-- e.preventDefault()       |                        |
       |                               |-- setIsSubmitting(true)    |                        |
       |                               |-- POST /api/contact ------>|                        |
       |                               |                            |-- validate name/email  |
       |                               |                            |-- prisma.create() ---->|
       |                               |                            |                        |-- INSERT row
       |                               |                            |<-- submission ---------|
       |                               |                            |-- sendContactAlert() ->|
       |                               |                            |                        |-- send email
       |                               |<-- { success: true } ------|                        |
       |                               |-- setIsSuccess(true)       |                        |
       |<-- success screen ------------|                            |                        |
       |                               |-- setTimeout 2500ms        |                        |
       |<-- modal closes --------------|                            |                        |
```
