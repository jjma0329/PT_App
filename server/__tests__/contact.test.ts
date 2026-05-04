import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    contactSubmission: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../services/emailService.ts', () => ({
  sendContactAlert: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendBookingNotification: vi.fn(),
  sendCancellationNotification: vi.fn(),
  sendClientCancellationEmail: vi.fn(),
  sendBookingReminder: vi.fn(),
  sendReviewRequest: vi.fn(),
}));

import app from '../app.ts';
import { prisma } from '../lib/prisma.ts';
import { sendContactAlert } from '../services/emailService.ts';

const mockSubmission = {
  id: 1,
  name: 'Alex Smith',
  email: 'alex@example.com',
  phone: '555-0100',
  goal: 'Lose weight',
  message: 'Looking for a trainer',
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// POST /api/contact
// ─────────────────────────────────────────────
describe('POST /api/contact', () => {
  it('returns 201 and the saved submission on a valid request', async () => {
    vi.mocked(prisma.contactSubmission.create).mockResolvedValueOnce(mockSubmission);

    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Alex Smith', email: 'alex@example.com', goal: 'Lose weight' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('alex@example.com');
  });

  it('calls sendContactAlert after a successful save', async () => {
    vi.mocked(prisma.contactSubmission.create).mockResolvedValueOnce(mockSubmission);
    vi.mocked(sendContactAlert).mockResolvedValueOnce(undefined);

    await request(app)
      .post('/api/contact')
      .send({ name: 'Alex Smith', email: 'alex@example.com' });

    expect(sendContactAlert).toHaveBeenCalledOnce();
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ email: 'alex@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Name and email are required.');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Alex Smith' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name and email are required.');
  });

  it('still returns 201 when the alert email fails', async () => {
    vi.mocked(prisma.contactSubmission.create).mockResolvedValueOnce(mockSubmission);
    vi.mocked(sendContactAlert).mockRejectedValueOnce(new Error('Resend down'));

    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Alex Smith', email: 'alex@example.com' });

    // Email failure is non-fatal — submission was already saved
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 when the database write fails', async () => {
    vi.mocked(prisma.contactSubmission.create).mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Alex Smith', email: 'alex@example.com' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to save submission.');
  });

  it('stores optional fields as null when omitted', async () => {
    vi.mocked(prisma.contactSubmission.create).mockResolvedValueOnce({ ...mockSubmission, phone: null, goal: null, message: null });

    await request(app)
      .post('/api/contact')
      .send({ name: 'Alex Smith', email: 'alex@example.com' });

    const createCall = vi.mocked(prisma.contactSubmission.create).mock.calls[0][0];
    expect(createCall.data.phone).toBeNull();
    expect(createCall.data.goal).toBeNull();
    expect(createCall.data.message).toBeNull();
  });
});
