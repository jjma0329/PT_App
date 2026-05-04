import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Prisma is pulled in transitively — stub it out so the module graph loads.
vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    booking: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    contactSubmission: { create: vi.fn() },
    testimonial: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../services/calendarService.ts', () => ({
  getAvailableSlots: vi.fn(),
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getAuthenticatedClient: vi.fn(),
  getAuthUrl: vi.fn(),
  saveTokensFromCode: vi.fn(),
}));

vi.mock('../services/emailService.ts', () => ({
  sendBookingConfirmation: vi.fn(),
  sendBookingNotification: vi.fn(),
  sendCancellationNotification: vi.fn(),
  sendClientCancellationEmail: vi.fn(),
  sendContactAlert: vi.fn(),
  sendBookingReminder: vi.fn(),
  sendReviewRequest: vi.fn(),
}));

import app from '../app.ts';

// vitest.config.ts sets:
//   ADMIN_EMAIL = 'trainer@test.com'
//   ADMIN_PASSWORD_HASH = bcrypt hash of 'test-password-123'
//   JWT_SECRET = 'test-jwt-secret'
const CORRECT_EMAIL = 'trainer@test.com';
const CORRECT_PASSWORD = 'test-password-123'; // hashed value is in vitest.config.ts

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('returns 200 and a signed JWT on correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CORRECT_EMAIL, password: CORRECT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');

    // The token should be verifiable with the known test secret
    const decoded = jwt.verify(res.body.data.token, 'test-jwt-secret') as { role: string };
    expect(decoded.role).toBe('trainer');
  });

  it('accepts email in a different case (case-insensitive match)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'TRAINER@TEST.COM', password: CORRECT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: CORRECT_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required.');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CORRECT_EMAIL });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required.');
  });

  it('returns 400 when email is whitespace only', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '   ', password: CORRECT_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('returns 401 on wrong password — same generic error to prevent enumeration', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CORRECT_EMAIL, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials.');
  });

  it('returns 401 on wrong email — same generic error to prevent enumeration', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'attacker@evil.com', password: CORRECT_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials.');
  });
});
