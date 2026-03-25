import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import contactRouter from './routes/contact.js';
import authRouter from './routes/auth.js';
import slotsRouter from './routes/slots.js';
import bookingsRouter from './routes/bookings.js';

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

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

app.use('/api', apiLimiter);
app.use('/api/contact', contactRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/auth', authRouter);

app.listen(PORT);
