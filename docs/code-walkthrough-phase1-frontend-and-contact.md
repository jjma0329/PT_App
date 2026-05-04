# Code Walkthrough — Phase 1: React Frontend + Contact Form

**Audience:** Someone who knows Python well and is learning TypeScript/React at a beginner–intermediate level.

---

## What Phase 1 Built

The entire public-facing website (React + Tailwind) plus the first backend feature: a contact form that saves submissions to the database and emails the trainer.

---

## Topology

```
Browser
└── index.html
    └── src/main.tsx              ← mounts React into the page
        └── src/App.tsx           ← React Router setup (routes only, no component logic)
            ├── /            → src/pages/LandingPage.tsx  ← owns modal state, renders all sections
            │   ├── Header.tsx
            │   ├── HeroSection.tsx   ← animated typing effect
            │   ├── ServicesSection.tsx
            │   ├── AboutSection.tsx
            │   ├── PlansSection.tsx
            │   ├── ReviewsSection.tsx
            │   ├── TestimonialsSection.tsx
            │   ├── Footer.tsx
            │   ├── ContactModal.tsx  ← contact form (4 states: idle/submitting/success/error)
            │   └── BookingModal.tsx
            ├── /review      → src/pages/ReviewPage.tsx
            ├── /admin/login → src/pages/admin/AdminLoginPage.tsx
            └── /admin       → src/pages/admin/AdminPage.tsx (protected by ProtectedRoute)
                        │
                        │  POST /api/contact
                        ▼
Express Server (server/app.ts)
└── /api/contact  →  server/routes/contact.ts
                          └── server/controllers/contactController.ts
                                    ├── validates name + email
                                    ├── prisma.contactSubmission.create()
                                    │       └── server/lib/prisma.ts  ← DB client (singleton)
                                    │               └── PostgreSQL (Neon)
                                    └── sendContactAlert()
                                            └── server/services/emailService.ts
                                                    └── Resend API  ← delivers email to trainer
```

---

## `src/main.tsx` — App Entry Point

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

This is the first file that runs. It finds the `<div id="root">` in `index.html` and hands control of it to React.

**Python analogy:** Like `if __name__ == "__main__": app.run()` in Flask — it's the launch point.

- `createRoot` — React 18's way of taking over a DOM node and rendering components inside it.
- `StrictMode` — a development-only wrapper that intentionally runs some code twice to catch bugs early. Zero effect in production builds. Think of it as running your code with extra assertions on.
- The `!` after `getElementById('root')` — TypeScript knows that `getElementById` *might* return `null` if the element doesn't exist. The `!` is a non-null assertion: you're telling TypeScript "trust me, this element exists." Without it, TypeScript refuses to compile.

---

## `src/lib/utils.ts` — The `cn()` Helper

```ts
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
```

`cn()` is a small helper for building Tailwind CSS class strings conditionally. You'll see it in almost every component.

**Why it exists:** Tailwind classes are just strings. Sometimes you only want a class applied under a condition. Without a helper, you end up with messy template literals:

```tsx
// Without cn() — hard to read
className={`w-full py-3 ${isSubmitting ? 'bg-zinc-700 text-zinc-400' : 'bg-yellow-400 text-zinc-950'}`}

// With cn() — clean and readable
className={cn(
  'w-full py-3',
  isSubmitting ? 'bg-zinc-700 text-zinc-400' : 'bg-yellow-400 text-zinc-950'
)}
```

`clsx` handles arrays, objects, and falsy values — it filters out anything that's `false`, `null`, or `undefined` and joins the rest.

**Python analogy:** Like writing `' '.join(filter(None, ['base-class', condition and 'extra-class']))`.

---

## `src/App.tsx` — Router Shell

```tsx
// src/main.tsx — BrowserRouter lives here, wrapping App before render
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// src/App.tsx — purely a routing table
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
```

`App` is a routing table — it maps URL paths to page components. `BrowserRouter` is set up in `main.tsx` so the router context is available to the entire app. All component logic (modal state, layout) lives in the individual page components.

**Why the refactor?** Phase 1 had a single-page site with no URLs. Phase 4 added `/admin` and `/review` pages with their own routes. Rather than cramming route logic into a component that also manages modal state, `App` became a clean router shell and `LandingPage` took over the public site's state.

**`ProtectedRoute`** is a wrapper that checks for a valid JWT in `localStorage`. If none exists it redirects to `/admin/login`. The pattern is: the route is mounted, but `ProtectedRoute` gates access before rendering `AdminPage`.

---

## `src/pages/LandingPage.tsx` — Public Landing Page + Modal State

```tsx
export function LandingPage() {
  const [contactOpen, setContactOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <>
      <Header onOpenModal={() => setBookingOpen(true)} />
      <main>
        <HeroSection onOpenModal={() => setBookingOpen(true)} />
        ...
      </main>
      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
      <BookingModal isOpen={bookingOpen} onClose={() => setBookingOpen(false)} />
    </>
  );
}
```

`LandingPage` is what the old `App` used to do — it owns the modal state and renders all sections of the public site. The logic is identical; it just moved to a dedicated page component so routing could be introduced cleanly.

**Why state lives here (not inside each button):**
Multiple places on the page can open the booking modal — the Header, Hero, About section, Plans section. If each component had its own `useState`, they'd each control a *different* modal instance independently. By putting state in `LandingPage`, there's one source of truth: one modal, one state variable, opened by any child that receives the `setBookingOpen` function as a prop.

**Python analogy:** `useState` is like a class attribute (`self.modal_open = False`) except React automatically re-renders the UI whenever the value changes. You don't call any "refresh" method — React detects the change and updates the DOM.

**The `<>...</>` fragment:**
React requires each component to return a *single* root element. `<>` (short for `<React.Fragment>`) groups multiple children without adding an extra `<div>` to the actual HTML.

---

## `src/components/Header.tsx` — Navigation

```tsx
const navItems = [
  { label: 'Home',     href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'About Me', href: '#about' },
  { label: 'Contact',  href: null },  // null = opens modal, not a link
  { label: 'Review',   href: '#review' },
];
```

A fixed header that sticks to the top while scrolling. On mobile it collapses to a hamburger menu.

**The data array pattern:**
Nav items are defined as an array of objects, then `.map()`'d into JSX. This is the standard React list rendering pattern.

```tsx
{navItems.map(({ label, href }) =>
  href
    ? <a href={href}>{label}</a>        // anchor for page sections
    : <button onClick={...}>{label}</button>  // button for modal trigger
)}
```

`href: null` acts as a flag. When the map encounters `null`, it renders a `<button>` that calls `onOpenModal` instead of a link.

**Hamburger toggle:**
```tsx
const [menuOpen, setMenuOpen] = useState(false);

<button onClick={() => setMenuOpen(prev => !prev)}>
  <i className={cn('bx', menuOpen ? 'bx-x' : 'bx-menu')} />
</button>
```

`prev => !prev` is a functional state update — it flips the current value. The icon switches between hamburger and X based on the current state.

**Responsive classes with `cn()`:**
```tsx
className={cn(
  'absolute top-full left-0 right-0 bg-zinc-950',  // mobile layout
  'md:static md:bg-transparent md:flex',            // desktop overrides
  menuOpen ? 'block' : 'hidden md:flex'            // visibility logic
)}
```

Tailwind uses breakpoint prefixes like `md:` to apply styles only above a certain screen width. `md:flex` means "always show as flex on desktop regardless of `menuOpen`."

---

## `src/components/HeroSection.tsx` — Full-Bleed Hero + Animated Typing Effect

The hero section uses a full-screen background image with a dark gradient overlay so the text stays readable, and a Typed.js animation cycling through training goals.

**Layout structure:**
```tsx
<section id="home" className="relative min-h-screen flex items-center">
  {/* psyduck1.png fills the entire section */}
  <img className="absolute inset-0 w-full h-full object-cover object-center" />

  {/* Dark gradient — strong on the left, fades right, keeps text legible */}
  <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-950/10" />

  {/* Text content sits above both layers via z-10 */}
  <div className="relative z-10 ...">
    ...headline, typed text, CTA button...
  </div>
</section>
```

- `absolute inset-0` — shorthand for `top: 0; right: 0; bottom: 0; left: 0`. Pins the element to all four edges of the nearest `relative` parent.
- `object-cover` — the image scales to fill the container without distorting. It crops rather than letterboxes. Like CSS `background-size: cover`.
- `bg-gradient-to-r from-zinc-950 ... to-zinc-950/10` — a left-to-right gradient. The `/10` suffix is Tailwind's opacity modifier: `zinc-950` at 10% opacity. The text (on the left) has a nearly-solid dark background; the right side of the image shows through clearly.
- `relative z-10` — stacks the text content above the image and overlay layers. Lower `z` values are behind; higher values are in front.

**Animated typing effect:**
```tsx
const typedRef = useRef<HTMLSpanElement>(null);

useEffect(() => {
  if (!typedRef.current) return;

  const typed = new Typed(typedRef.current, {
    strings: ['Physical Fitness', 'Weight Gain', 'Strength Training', 'Fat Loss', 'Weight Lifting'],
    typeSpeed: 60,
    backSpeed: 60,
    loop: true,
  });

  return () => typed.destroy();
}, []);
```

The `<span>` element is where Typed.js writes its animated text.

**`useRef`:**
In Python, you'd just hold a reference to an object (`element = document.get_element(...)`). `useRef` is the React equivalent — a stable reference to a real DOM element that persists across re-renders. Typed.js needs a direct handle to the DOM node, not React's abstraction of it.

**`useEffect` with `[]`:**
`useEffect` is where you run side effects — things that reach outside React's component system (like initializing a third-party library). The empty `[]` dependency array means "run once, after the component first appears on screen." That's the earliest safe moment to access the DOM element.

**Python analogy:** Like an `__init__` that runs after the object is fully ready, including its DOM placement.

**The cleanup `return () => typed.destroy()`:**
`useEffect` can return a "cleanup" function. React calls it when the component is removed from the screen. Without this, Typed.js keeps running in the background — a memory leak. This is like Python's `__del__` or a context manager's `__exit__`.

**`if (!typedRef.current) return`:**
A defensive guard. On the first render tick the ref might not be attached yet. This prevents a crash.

---

## `src/components/ContactModal.tsx` — The Contact Form

This is the most complex frontend component. It manages four state values and three `useEffect`s.

### State

```tsx
const [formData, setFormData] = useState<FormData>(initialFormData);
const [isSubmitting, setIsSubmitting] = useState(false);
const [isSuccess, setIsSuccess] = useState(false);
const [error, setError] = useState<string | null>(null);
```

- `formData` — the current value of every input field, kept in sync with what the user types
- `isSubmitting` — `true` while the API call is in-flight; disables the button to prevent duplicate submits
- `isSuccess` — when `true`, replaces the form with a success message
- `error` — holds an error string to show inline if the API call fails

**TypeScript: `string | null`** means the value is either a string or null. It can't be a number or boolean. Python equivalent: `Optional[str]` with a type hint.

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
Registers a keyboard listener when the modal is mounted. The cleanup `removeEventListener` unregisters it when the modal unmounts — otherwise you'd add a new listener every time the modal opens, and they'd stack up.

**2. Body scroll lock:**
```tsx
useEffect(() => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
  return () => { document.body.style.overflow = ''; };
}, [isOpen]);
```
When the modal is open, the page behind it shouldn't scroll. `overflow: hidden` on `<body>` prevents that. Runs whenever `isOpen` changes.

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
When the modal closes, we wait 300ms before resetting. Why? The modal likely has a CSS fade-out animation. Resetting immediately would make the form visibly flash back to empty while it's still partially visible. The 300ms lets the animation finish. The cleanup `clearTimeout` cancels the timer if the modal reopens before the 300ms fires.

### Form input pattern

```tsx
onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
```

All inputs use this same pattern:
- `prev` is the current form state object
- `{ ...prev, name: e.target.value }` spreads all existing fields and overwrites only `name`
- You're updating one key without losing the others

**Python analogy:** Like `form_data = {**prev, 'name': new_value}`.

### `handleSubmit`

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();        // stop the browser from reloading the page
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
    setTimeout(() => onClose(), 2500);
  } catch {
    setError('Something went wrong. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
```

- `e.preventDefault()` — HTML forms reload the page on submit by default. This stops that.
- `fetch` — the browser's built-in HTTP client. **Important:** `fetch` does NOT throw on 4xx/5xx responses. `res.ok` is `false` for those, so we throw manually to route them through the `catch` block.
- `finally` — runs whether the request succeeded or failed. Ensures the button is always re-enabled so the user can retry.

**Python analogy:** `fetch` is like `requests.post(...)` except it returns a Promise (an async value) instead of blocking.

### Overlay click to close

```tsx
const handleOverlayClick = (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) onClose();
};
```

`e.target` is the element actually clicked. `e.currentTarget` is the element the handler is attached to (the dark backdrop overlay). If they're the same, the click landed on the backdrop — not inside the modal box — so we close. This prevents closing when the user clicks inside the form.

---

## `server/lib/prisma.ts` — Database Client

```ts
import { PrismaClient } from '../../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const prisma = new PrismaClient({ adapter });
```

**What it does:**
Sets up the single shared database client for the entire backend.

- `PrismaPg` — the PostgreSQL driver adapter. It opens a real TCP connection to the database using the URL from `.env`.
- `PrismaClient` — Prisma's query builder. When you write `prisma.contactSubmission.create(...)`, Prisma translates that into a SQL `INSERT` statement.
- **Singleton pattern** — this file is `import`ed in multiple controllers. Node.js caches module imports, so this code only runs once no matter how many times it's imported. Every controller gets the same `prisma` instance. You don't accidentally open dozens of DB connections.

**Python analogy:** Like a module-level `db = psycopg2.connect(...)` — it runs once when the module is first imported.

**`process.env.DATABASE_URL!`** — reads the `DATABASE_URL` environment variable. The `!` tells TypeScript this value is definitely set (not `undefined`). Like Python's `os.environ['DATABASE_URL']` which throws if missing — the `!` is our promise that it's there.

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

`escapeHtml` sanitizes user-submitted text before it's embedded in an HTML email. Without this, a user could type `<script>alert('xss')</script>` in the name field and it would execute as code when the email is opened — a classic XSS attack. Each `.replace()` converts the dangerous character to its safe HTML entity equivalent.

`safeField` wraps `escapeHtml` and handles optional fields — if the value is missing/null/undefined, it displays a dash (`—`) rather than leaving a blank.

### `sendContactAlert()`

```ts
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'JJM Fitness <onboarding@resend.dev>';

export async function sendContactAlert(contact: ContactDetails): Promise<void> {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: process.env.TRAINER_EMAIL!,
    subject: `New session booking — ${escapeHtml(contact.name)}`,
    html: `...HTML table with contact details...`,
  });
}
```

Sends an HTML email to the trainer whenever someone submits the contact form. Uses [Resend](https://resend.com) as the delivery service (like an SMTP relay as an API).

- `FROM_ADDRESS` — reads the sender address from `RESEND_FROM_EMAIL` in `.env`. Falls back to Resend's sandbox address for development. Set `RESEND_FROM_EMAIL` to a verified custom domain in production (e.g. `JJM Fitness <noreply@yourfitnessdomain.com>`) to avoid spam filters.
- `to: process.env.TRAINER_EMAIL!` — trainer's email, from `.env`.
- Every user-submitted value passes through `escapeHtml` or `safeField` before landing in the HTML.

---

## `server/controllers/contactController.ts` — The Handler

```ts
export async function createContact(req: Request, res: Response): Promise<void> {
  const { name, email, phone, goal, message } = req.body;

  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ success: false, error: 'Name and email are required.' });
    return;
  }

  if (name.trim().length > 100) {
    res.status(400).json({ success: false, error: 'name must be 100 characters or fewer.' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    res.status(400).json({ success: false, error: 'Invalid email address.' });
    return;
  }

  if (message && message.trim().length > 2000) {
    res.status(400).json({ success: false, error: 'message must be 2000 characters or fewer.' });
    return;
  }

  try {
    const submission = await prisma.contactSubmission.create({
      data: {
        name:    name.trim(),
        email:   email.trim().toLowerCase(),
        phone:   phone?.trim() || null,
        goal:    goal?.trim() || null,
        message: message?.trim() || null,
      },
    });

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

**Early return pattern:**
The validation checks return immediately on failure. The rest of the function only executes if all validation passed. This avoids nesting the entire happy path inside `else` blocks.

**Email and length validation:**
Contact previously only checked that name and email were present. Now it also validates email format (same regex used in the booking controller) and enforces a 100-character cap on `name` and 2000-character cap on `message`. Without server-side limits, oversized inputs could be stored and forwarded to Resend without restriction.

**`.trim()` and `.toLowerCase()`:**
`name?.trim()` strips whitespace — the `?.` (optional chaining) calls `.trim()` only if `name` is not null/undefined. `email.trim().toLowerCase()` normalizes addresses so `User@Example.COM` and `user@example.com` match in any future lookup.

**`phone?.trim() || null`:**
Optional fields from the form might arrive as empty strings `""`. The database expects `null` for missing optional values, not empty strings. `phone?.trim() || null` trims if present, then converts the falsy empty string (or undefined) to `null`.

**Nested try/catch for email:**
The email send has its own inner `try/catch`. If Resend is down or the API key is wrong, the form submission doesn't fail — the contact record is already saved (the important thing). The outer `try/catch` covers only DB failures, which *are* fatal.

**HTTP 201 vs 200:**
`201 Created` is the correct status for creating a new resource. `200 OK` means "the request worked." Both function the same way — `201` is more semantically precise.

**`Promise<void>`** — the return type annotation. This async function returns a Promise that resolves with no value (`void`). Like Python's `async def create_contact() -> None:`.

---

## `server/routes/contact.ts` — Route Registration

```ts
const router = Router();
router.post('/', createContact);
export default router;
```

This file only does one thing: map `POST /` to the `createContact` controller function. The `/` is relative — when mounted at `/api/contact` in `server/index.ts`, the full path becomes `POST /api/contact`.

**Why separate routes from controllers:**
Routes answer: "which URL goes to which function?" Controllers answer: "what does the function do?" Keeping them in separate files makes each smaller, easier to read, and easier to test independently. This is the standard Express pattern (similar to Django's `urls.py` + `views.py` separation).

---

## `prisma/schema.prisma` — ContactSubmission Model

```prisma
model ContactSubmission {
  id        Int      @id @default(autoincrement())
  name      String
  email     String
  phone     String?
  goal      String?
  message   String?
  createdAt DateTime @default(now())
}
```

This Prisma model definition is like declaring a Python dataclass — Prisma reads it and generates a corresponding TypeScript type plus the SQL table. The `?` marks optional fields (nullable in the DB). `@default(now())` auto-populates the timestamp on insert.

**Python analogy:**
```python
@dataclass
class ContactSubmission:
    id: int           # auto-increment primary key
    name: str
    email: str
    phone: Optional[str] = None
    goal: Optional[str] = None
    message: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
```

---

## Full Request Flow

```
Visitor                   React (ContactModal)            Express Server             DB / Email
   |                              |                               |                      |
   |  types in form               |                               |                      |
   |  clicks "Send Message" ─────►|                               |                      |
   |                              | e.preventDefault()            |                      |
   |                              | setIsSubmitting(true)         |                      |
   |                              │                               |                      |
   |                              │── POST /api/contact ─────────►|                      |
   |                              │   body: { name, email, ... }  |                      |
   |                              │                               | validate name+email   |
   |                              │                               │                      |
   |                              │                               │── prisma.create() ──►|
   |                              │                               │                      │── INSERT row
   |                              │                               │◄── submission ───────│
   |                              │                               │                      |
   |                              │                               │── sendContactAlert() ►|
   |                              │                               │                      │── Resend API
   |                              │                               │                      │── email → trainer
   |                              │                               │                      |
   |                              │◄── { success: true } ─────────│                      |
   |                              │                               |                      |
   |                              │ setIsSuccess(true)            |                      |
   |◄── success screen ───────────│                               |                      |
   |                              │ setTimeout 2500ms             |                      |
   |◄── modal closes ─────────────│                               |                      |
```

**Note on rate limiting (added in Phase 3):** Every `/api/*` route passes through an `apiLimiter` middleware before reaching any controller. If the same IP sends more than 20 requests in a 15-minute window, subsequent requests receive `429 Too Many Requests` and the controller is never called. The flow above assumes the rate limit hasn't been hit.

---

## Key TypeScript Concepts Used (Python Comparison)

| TypeScript | Python equivalent |
|---|---|
| `const x: string = "hello"` | `x: str = "hello"` |
| `string \| null` | `Optional[str]` |
| `interface FormData { name: string }` | `@dataclass class FormData: name: str` |
| `async function foo(): Promise<void>` | `async def foo() -> None:` |
| `process.env.TRAINER_EMAIL!` | `os.environ['TRAINER_EMAIL']` |
| `export function foo()` | public function (module-level) |
| `export default foo` | the "main" thing a module exports |
