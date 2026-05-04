import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import contactRouter from './routes/contact.js';
import authRouter from './routes/auth.js';
import slotsRouter from './routes/slots.js';
import bookingsRouter from './routes/bookings.js';
import trainerAuthRouter from './routes/trainerAuth.js';
import testimonialsRouter from './routes/testimonials.js';

const app = express();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

// Adds Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, etc.
app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// Rate limiting — applied to all /api/* routes (SEC-04).
// 20 requests per 15 minutes per IP. Keeps form spam and brute-force attempts manageable
// without blocking legitimate users (a normal visitor will make 2–3 API calls max).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 20,
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  // Skip rate limiting in tests — the 20-request ceiling would cause
  // false 429s mid-suite. Production behavior is unaffected.
  skip: () => process.env.NODE_ENV === 'test',
});

// Session middleware — used only to store the OAuth state param during the
// auth redirect flow. The state is a short-lived CSRF token; nothing sensitive
// is kept in the session long-term.
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,   // JS can't read the cookie — prevents XSS theft
    secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
    maxAge: 10 * 60 * 1000, // 10 minutes — enough to complete the OAuth flow
  },
}));

// Stricter rate limit for login — 5 attempts per 15 min prevents brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

app.use('/api', apiLimiter);
app.use('/api/contact', contactRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/auth', loginLimiter, trainerAuthRouter);
app.use('/api/testimonials', testimonialsRouter);
app.use('/auth', authRouter);

export default app;
