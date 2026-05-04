import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    booking: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    contactSubmission: { create: vi.fn() },
    testimonial: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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
import { prisma } from '../lib/prisma.ts';

const VALID_TOKEN = jwt.sign({ role: 'trainer' }, 'test-jwt-secret', { expiresIn: '1h' });
const AUTH_HEADER = `Bearer ${VALID_TOKEN}`;

const mockTestimonial = {
  id: 1,
  name: 'Jane Doe',
  rating: 5,
  message: 'Best trainer ever!',
  approved: false,
  createdAt: new Date(),
};

const approvedTestimonial = { ...mockTestimonial, approved: true };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// POST /api/testimonials — public submission
// ─────────────────────────────────────────────
describe('POST /api/testimonials', () => {
  it('returns 201 and saved testimonial on a valid request', async () => {
    vi.mocked(prisma.testimonial.create).mockResolvedValueOnce(mockTestimonial);

    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: 'Jane Doe', rating: 5, message: 'Best trainer ever!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approved).toBe(false);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .send({ rating: 5, message: 'Great!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name is required.');
  });

  it('returns 400 when name is whitespace only', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: '   ', rating: 5, message: 'Great!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name is required.');
  });

  it('returns 400 when message is missing', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: 'Jane', rating: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required.');
  });

  it('returns 400 when rating is below 1', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: 'Jane', rating: 0, message: 'OK' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('rating must be an integer between 1 and 5.');
  });

  it('returns 400 when rating is above 5', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: 'Jane', rating: 6, message: 'OK' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('rating must be an integer between 1 and 5.');
  });

  it('returns 400 when rating is a decimal', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: 'Jane', rating: 4.5, message: 'OK' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('rating must be an integer between 1 and 5.');
  });

  it('returns 400 when rating is a string', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: 'Jane', rating: 'five', message: 'OK' });

    expect(res.status).toBe(400);
  });

  it('trims name and message before saving', async () => {
    vi.mocked(prisma.testimonial.create).mockResolvedValueOnce(mockTestimonial);

    await request(app)
      .post('/api/testimonials')
      .send({ name: '  Jane  ', rating: 5, message: '  Great!  ' });

    const createCall = vi.mocked(prisma.testimonial.create).mock.calls[0][0];
    expect(createCall.data.name).toBe('Jane');
    expect(createCall.data.message).toBe('Great!');
  });

  it('returns 500 when the database write fails', async () => {
    vi.mocked(prisma.testimonial.create).mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/testimonials')
      .send({ name: 'Jane', rating: 5, message: 'Great!' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to save testimonial.');
  });
});

// ─────────────────────────────────────────────
// GET /api/testimonials/approved — public
// ─────────────────────────────────────────────
describe('GET /api/testimonials/approved', () => {
  it('returns 200 and approved testimonials without a JWT', async () => {
    vi.mocked(prisma.testimonial.findMany).mockResolvedValueOnce([approvedTestimonial]);

    const res = await request(app).get('/api/testimonials/approved');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].approved).toBe(true);
  });

  it('returns 200 with an empty array when no testimonials are approved', async () => {
    vi.mocked(prisma.testimonial.findMany).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/testimonials/approved');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('queries with approved: true filter', async () => {
    vi.mocked(prisma.testimonial.findMany).mockResolvedValueOnce([]);

    await request(app).get('/api/testimonials/approved');

    const findCall = vi.mocked(prisma.testimonial.findMany).mock.calls[0][0];
    expect(findCall?.where).toEqual({ approved: true });
  });

  it('returns 500 when the database query fails', async () => {
    vi.mocked(prisma.testimonial.findMany).mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/testimonials/approved');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch testimonials.');
  });
});

// ─────────────────────────────────────────────
// GET /api/testimonials — trainer-only (all)
// ─────────────────────────────────────────────
describe('GET /api/testimonials', () => {
  it('returns 200 and all testimonials with a valid JWT', async () => {
    vi.mocked(prisma.testimonial.findMany).mockResolvedValueOnce([mockTestimonial, approvedTestimonial]);

    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 401 without a JWT', async () => {
    const res = await request(app).get('/api/testimonials');

    expect(res.status).toBe(401);
  });

  it('returns 500 when the database query fails', async () => {
    vi.mocked(prisma.testimonial.findMany).mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch testimonials.');
  });
});

// ─────────────────────────────────────────────
// PATCH /api/testimonials/:id/approve — trainer-only
// ─────────────────────────────────────────────
describe('PATCH /api/testimonials/:id/approve', () => {
  it('returns 200 and the approved testimonial on a valid request', async () => {
    vi.mocked(prisma.testimonial.findUnique).mockResolvedValueOnce(mockTestimonial);
    vi.mocked(prisma.testimonial.update).mockResolvedValueOnce(approvedTestimonial);

    const res = await request(app)
      .patch('/api/testimonials/1/approve')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approved).toBe(true);
  });

  it('returns 401 without a JWT', async () => {
    const res = await request(app).patch('/api/testimonials/1/approve');

    expect(res.status).toBe(401);
  });

  it('returns 400 when the testimonial ID is not a number', async () => {
    const res = await request(app)
      .patch('/api/testimonials/abc/approve')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid testimonial ID.');
  });

  it('returns 404 when the testimonial does not exist', async () => {
    vi.mocked(prisma.testimonial.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/testimonials/999/approve')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Testimonial not found.');
  });

  it('returns 409 when the testimonial is already approved', async () => {
    vi.mocked(prisma.testimonial.findUnique).mockResolvedValueOnce(approvedTestimonial);

    const res = await request(app)
      .patch('/api/testimonials/1/approve')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Testimonial is already approved.');
  });

  it('returns 500 when the database update fails', async () => {
    vi.mocked(prisma.testimonial.findUnique).mockResolvedValueOnce(mockTestimonial);
    vi.mocked(prisma.testimonial.update).mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .patch('/api/testimonials/1/approve')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to approve testimonial.');
  });
});
