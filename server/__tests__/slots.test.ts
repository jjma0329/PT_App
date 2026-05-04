import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../services/calendarService.ts', () => ({
  getAvailableSlots: vi.fn(),
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getAuthenticatedClient: vi.fn(),
  getAuthUrl: vi.fn(),
  saveTokensFromCode: vi.fn(),
}));

// Prisma is pulled in transitively by app.ts — provide a minimal stub so the
// module graph doesn't fail to load during these slot-only tests.
vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    booking: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    contactSubmission: { create: vi.fn() },
    testimonial: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
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
import { getAvailableSlots } from '../services/calendarService.ts';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// GET /api/slots
// ─────────────────────────────────────────────
describe('GET /api/slots', () => {
  it('returns 200 and an array of slots for a valid date', async () => {
    const slots = ['2027-06-01T10:00:00.000Z', '2027-06-01T11:00:00.000Z'];
    vi.mocked(getAvailableSlots).mockResolvedValueOnce(slots);

    const res = await request(app).get('/api/slots?date=2027-06-01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(slots);
  });

  it('returns 400 when the date query param is missing', async () => {
    const res = await request(app).get('/api/slots');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date query param is required/);
  });

  it('returns 400 when date is not in YYYY-MM-DD format', async () => {
    const res = await request(app).get('/api/slots?date=June+1+2027');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('date must be in YYYY-MM-DD format.');
  });

  it('returns 400 when date is an impossible calendar date', async () => {
    const res = await request(app).get('/api/slots?date=2027-13-45');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('date must be in YYYY-MM-DD format.');
  });

  it('returns 500 with a generic message when the calendar service throws', async () => {
    vi.mocked(getAvailableSlots).mockRejectedValueOnce(new Error('Google Calendar unavailable'));

    const res = await request(app).get('/api/slots?date=2027-06-01');

    expect(res.status).toBe(500);
    // Internal error message must not be leaked to clients
    expect(res.body.error).toBe('Unable to fetch available slots.');
  });

  it('passes the date string directly to getAvailableSlots', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValueOnce([]);

    await request(app).get('/api/slots?date=2027-06-01');

    expect(getAvailableSlots).toHaveBeenCalledWith('2027-06-01');
  });
});
