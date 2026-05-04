import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// --- Mocks must be declared before any imports that trigger module loading ---
// vi.mock() is hoisted to the top of the file by Vitest, so the mocked
// versions are in place before app.ts (and the modules it imports) are evaluated.

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    booking: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../services/calendarService.ts', () => ({
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getAuthenticatedClient: vi.fn(),
  getAvailableSlots: vi.fn(),
  getAuthUrl: vi.fn(),
  saveTokensFromCode: vi.fn(),
}));

vi.mock('../services/emailService.ts', () => ({
  sendBookingConfirmation: vi.fn(),
  sendBookingNotification: vi.fn(),
  sendCancellationNotification: vi.fn(),
  sendClientCancellationEmail: vi.fn(),
  sendContactAlert: vi.fn(),
}));

// Import app AFTER mocks are declared
import app from '../app.ts';
import { prisma } from '../lib/prisma.ts';
import { createCalendarEvent, deleteCalendarEvent } from '../services/calendarService.ts';
import { sendBookingConfirmation, sendBookingNotification, sendCancellationNotification, sendClientCancellationEmail } from '../services/emailService.ts';

const NEW_SLOT = '2027-07-15T14:00:00.000Z';

// Shared fixtures
const VALID_SLOT = '2027-06-01T10:00:00.000Z';

// Generate a valid JWT using the same secret set in vitest.config.ts
// This tests the real requireJwt middleware — no mocking of auth.
const VALID_TOKEN = jwt.sign({ role: 'trainer' }, 'test-jwt-secret', { expiresIn: '1h' });
const AUTH_HEADER = `Bearer ${VALID_TOKEN}`;

const mockBooking = {
  id: 1,
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  message: null,
  slotTime: new Date(VALID_SLOT),
  status: 'confirmed',
  googleEventId: 'gcal-event-123',
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// POST /api/bookings — Create Booking
// ─────────────────────────────────────────────
describe('POST /api/bookings', () => {
  it('returns 201 and booking data on a valid request', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.create).mockResolvedValueOnce(mockBooking);
    vi.mocked(createCalendarEvent).mockResolvedValueOnce('gcal-event-123');
    vi.mocked(prisma.booking.update).mockResolvedValueOnce({ ...mockBooking, googleEventId: 'gcal-event-123' });

    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'jane@example.com', slotTime: VALID_SLOT });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('jane@example.com');
  });

  it('normalizes email to lowercase', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.create).mockResolvedValueOnce({ ...mockBooking, email: 'jane@example.com' });
    vi.mocked(createCalendarEvent).mockResolvedValueOnce(null);

    await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'JANE@EXAMPLE.COM', slotTime: VALID_SLOT });

    const createCall = vi.mocked(prisma.booking.create).mock.calls[0][0];
    expect(createCall.data.email).toBe('jane@example.com');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ email: 'jane@example.com', slotTime: VALID_SLOT });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when name is whitespace only', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ name: '   ', email: 'jane@example.com', slotTime: VALID_SLOT });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', slotTime: VALID_SLOT });

    expect(res.status).toBe(400);
  });

  it('returns 400 when slotTime is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'jane@example.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email format is invalid', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'not-an-email', slotTime: VALID_SLOT });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid email address.');
  });

  it('returns 400 when slotTime is not a valid date string', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'jane@example.com', slotTime: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid ISO datetime/);
  });

  it('returns 409 when the slot is already booked (API-level check)', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);

    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'jane@example.com', slotTime: VALID_SLOT });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been booked/);
  });

  it('returns 409 on a P2002 race condition (DB-level unique constraint)', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    vi.mocked(prisma.booking.create).mockRejectedValueOnce(p2002);

    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'jane@example.com', slotTime: VALID_SLOT });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been booked/);
  });

  it('still returns 201 when Google Calendar event creation fails', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.create).mockResolvedValueOnce(mockBooking);
    vi.mocked(createCalendarEvent).mockRejectedValueOnce(new Error('Google API down'));

    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'jane@example.com', slotTime: VALID_SLOT });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('still returns 201 when confirmation emails fail', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.create).mockResolvedValueOnce(mockBooking);
    vi.mocked(createCalendarEvent).mockResolvedValueOnce(null);
    vi.mocked(sendBookingConfirmation).mockRejectedValueOnce(new Error('Resend down'));

    const res = await request(app)
      .post('/api/bookings')
      .send({ name: 'Jane Doe', email: 'jane@example.com', slotTime: VALID_SLOT });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────
// GET /api/bookings — Admin List
// ─────────────────────────────────────────────
describe('GET /api/bookings', () => {
  it('returns 200 and booking list with a valid JWT', async () => {
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([mockBooking]);

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 200 with an empty array when there are no bookings', async () => {
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/bookings');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
  });

  it('returns 401 when a token signed with the wrong secret is provided', async () => {
    const badToken = jwt.sign({ role: 'trainer' }, 'wrong-secret', { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
  });

  it('returns 500 when the database query fails', async () => {
    vi.mocked(prisma.booking.findMany).mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch bookings.');
  });
});

// ─────────────────────────────────────────────
// PATCH /api/bookings/:id/cancel — Cancel Booking
// ─────────────────────────────────────────────
describe('PATCH /api/bookings/:id/cancel', () => {
  const cancelledBooking = { ...mockBooking, status: 'cancelled' };

  it('returns 200 and status "cancelled" on a valid cancel request', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(cancelledBooking);

    const res = await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).patch('/api/bookings/1/cancel');
    expect(res.status).toBe(401);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const res = await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
  });

  it('returns 400 when the booking ID is not a number', async () => {
    const res = await request(app)
      .patch('/api/bookings/abc/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid booking ID.');
  });

  it('returns 404 when the booking does not exist', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/bookings/999/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found.');
  });

  it('returns 409 when the booking is already cancelled', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(cancelledBooking);

    const res = await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Booking is already cancelled.');
  });

  it('still returns 200 when booking has no googleEventId (calendar step skipped)', async () => {
    const bookingWithoutCalendar = { ...mockBooking, googleEventId: null };
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(bookingWithoutCalendar);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(cancelledBooking);

    const res = await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it('still returns 200 when Google Calendar event deletion fails', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(cancelledBooking);
    vi.mocked(deleteCalendarEvent).mockRejectedValueOnce(new Error('410 Gone'));

    const res = await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('still returns 200 when the trainer notification email fails', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(cancelledBooking);
    vi.mocked(deleteCalendarEvent).mockResolvedValueOnce(undefined);
    vi.mocked(sendCancellationNotification).mockRejectedValueOnce(new Error('Resend down'));

    const res = await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('calls deleteCalendarEvent with the stored googleEventId', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(cancelledBooking);
    vi.mocked(deleteCalendarEvent).mockResolvedValueOnce(undefined);

    await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(deleteCalendarEvent).toHaveBeenCalledWith('gcal-event-123');
  });

  it('sends cancellation notification to trainer after cancel', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(cancelledBooking);

    await request(app)
      .patch('/api/bookings/1/cancel')
      .set('Authorization', AUTH_HEADER);

    expect(sendCancellationNotification).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────
// PATCH /api/bookings/:id/reschedule — Reschedule Booking
// ─────────────────────────────────────────────
describe('PATCH /api/bookings/:id/reschedule', () => {
  const rescheduledBooking = {
    ...mockBooking,
    slotTime: new Date(NEW_SLOT),
    reminderSentAt: null,
    googleEventId: 'gcal-new-event',
  };

  it('returns 200 with updated booking on a valid reschedule', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(rescheduledBooking);
    vi.mocked(createCalendarEvent).mockResolvedValueOnce('gcal-new-event');
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(rescheduledBooking);

    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(401);
  });

  it('returns 400 when the booking ID is not a number', async () => {
    const res = await request(app)
      .patch('/api/bookings/abc/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid booking ID.');
  });

  it('returns 400 when newSlotTime is missing', async () => {
    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('newSlotTime is required.');
  });

  it('returns 400 when newSlotTime is not a valid date', async () => {
    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid ISO datetime/);
  });

  it('returns 404 when the booking does not exist', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/bookings/999/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found.');
  });

  it('returns 409 when trying to reschedule a cancelled booking', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce({ ...mockBooking, status: 'cancelled' });

    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot reschedule a cancelled booking.');
  });

  it('returns 409 when new slot is the same as the current slot', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);

    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: VALID_SLOT }); // VALID_SLOT === mockBooking.slotTime

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('New slot is the same as the current slot.');
  });

  it('returns 409 when the new slot conflicts with another booking', async () => {
    const conflictBooking = { ...mockBooking, id: 2, slotTime: new Date(NEW_SLOT) };
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(conflictBooking);

    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('That time slot is already booked.');
  });

  it('resets reminderSentAt to null in the DB update', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(rescheduledBooking);
    vi.mocked(createCalendarEvent).mockResolvedValueOnce(null);

    await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    const updateCall = vi.mocked(prisma.booking.update).mock.calls[0][0];
    expect(updateCall.data.reminderSentAt).toBeNull();
    expect(updateCall.data.slotTime).toEqual(new Date(NEW_SLOT));
  });

  it('still returns 200 when Google Calendar deletion fails', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(rescheduledBooking);
    vi.mocked(deleteCalendarEvent).mockRejectedValueOnce(new Error('404 Not Found'));
    vi.mocked(createCalendarEvent).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('still returns 200 when new calendar event creation fails', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(rescheduledBooking);
    vi.mocked(deleteCalendarEvent).mockResolvedValueOnce(undefined);
    vi.mocked(createCalendarEvent).mockRejectedValueOnce(new Error('Google API down'));

    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 409 on a P2002 race condition at the DB level', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null);
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    vi.mocked(prisma.booking.update).mockRejectedValueOnce(p2002);

    const res = await request(app)
      .patch('/api/bookings/1/reschedule')
      .set('Authorization', AUTH_HEADER)
      .send({ newSlotTime: NEW_SLOT });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('That time slot is already booked.');
  });
});
