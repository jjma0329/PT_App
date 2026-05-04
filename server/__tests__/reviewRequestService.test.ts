import { describe, it, expect, vi, beforeEach } from 'vitest';

// reviewRequestService imports prisma as a default import (`import prisma from '...'`).
// The module only exports a named `prisma`. We provide both so the service gets
// its default and the test can access the same mock via the named import.
vi.mock('../lib/prisma.ts', () => {
  const booking = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const client = { booking };
  return { default: client, prisma: client };
});

vi.mock('../services/emailService.ts', () => ({
  sendReviewRequest: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendBookingNotification: vi.fn(),
  sendCancellationNotification: vi.fn(),
  sendClientCancellationEmail: vi.fn(),
  sendContactAlert: vi.fn(),
  sendBookingReminder: vi.fn(),
}));

import { sendPendingReviewRequests } from '../services/reviewRequestService.ts';
import { prisma } from '../lib/prisma.ts';
import { sendReviewRequest } from '../services/emailService.ts';

const makeBooking = (id: number, email: string, hoursAgo: number) => ({
  id,
  name: 'Test Client',
  email,
  phone: null,
  message: null,
  slotTime: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
  status: 'confirmed',
  googleEventId: null,
  createdAt: new Date(),
  reviewRequestSentAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// sendPendingReviewRequests service
// ─────────────────────────────────────────────
describe('sendPendingReviewRequests', () => {
  it('does nothing when no bookings are in the review window', async () => {
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([]);

    await sendPendingReviewRequests();

    expect(sendReviewRequest).not.toHaveBeenCalled();
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('sends a review request and stamps reviewRequestSentAt for each booking found', async () => {
    const bookings = [makeBooking(1, 'a@test.com', 2), makeBooking(2, 'b@test.com', 3)];
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce(bookings);
    vi.mocked(sendReviewRequest).mockResolvedValue(undefined);
    vi.mocked(prisma.booking.update).mockResolvedValue(bookings[0] as never);

    await sendPendingReviewRequests();

    expect(sendReviewRequest).toHaveBeenCalledTimes(2);
    expect(prisma.booking.update).toHaveBeenCalledTimes(2);
  });

  it('stamps reviewRequestSentAt with a Date (not null) after sending', async () => {
    const booking = makeBooking(1, 'a@test.com', 2);
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([booking]);
    vi.mocked(sendReviewRequest).mockResolvedValueOnce(undefined);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(booking as never);

    await sendPendingReviewRequests();

    const updateCall = vi.mocked(prisma.booking.update).mock.calls[0][0];
    expect(updateCall.data.reviewRequestSentAt).toBeInstanceOf(Date);
    expect(updateCall.where.id).toBe(1);
  });

  it('continues processing other bookings when one email send fails', async () => {
    const bookings = [makeBooking(1, 'fail@test.com', 2), makeBooking(2, 'ok@test.com', 3)];
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce(bookings);
    vi.mocked(sendReviewRequest)
      .mockRejectedValueOnce(new Error('Resend down'))  // first fails
      .mockResolvedValueOnce(undefined);                // second succeeds
    vi.mocked(prisma.booking.update).mockResolvedValue(bookings[1] as never);

    await sendPendingReviewRequests();

    expect(sendReviewRequest).toHaveBeenCalledTimes(2);
    expect(prisma.booking.update).toHaveBeenCalledTimes(1);
  });

  it('queries bookings in the 1h–7d past window with reviewRequestSentAt: null', async () => {
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([]);

    const before = Date.now();
    await sendPendingReviewRequests();
    const after = Date.now();

    const query = vi.mocked(prisma.booking.findMany).mock.calls[0][0];
    const { lte, gte } = query?.where?.slotTime as { lte: Date; gte: Date };

    // lte (windowEnd) = at least 1 hour ago — session must have already ended
    expect(lte.getTime()).toBeLessThanOrEqual(before - 1 * 60 * 60 * 1000);
    expect(lte.getTime()).toBeGreaterThanOrEqual(after  - 1 * 60 * 60 * 1000 - 100);

    // gte (windowStart) = no more than 7 days ago — avoids emailing very old sessions
    expect(gte.getTime()).toBeLessThanOrEqual(before - 7 * 24 * 60 * 60 * 1000 + 100);
    expect(gte.getTime()).toBeGreaterThanOrEqual(after  - 7 * 24 * 60 * 60 * 1000 - 100);

    expect(query?.where?.reviewRequestSentAt).toBeNull();
    expect(query?.where?.status).toBe('confirmed');
  });
});
