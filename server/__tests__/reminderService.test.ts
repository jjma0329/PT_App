import { describe, it, expect, vi, beforeEach } from 'vitest';

// reminderService imports prisma as a default import (`import prisma from '...'`).
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
  sendBookingReminder: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendBookingNotification: vi.fn(),
  sendCancellationNotification: vi.fn(),
  sendClientCancellationEmail: vi.fn(),
  sendContactAlert: vi.fn(),
  sendReviewRequest: vi.fn(),
}));

import { sendPendingReminders } from '../services/reminderService.ts';
import { prisma } from '../lib/prisma.ts';
import { sendBookingReminder } from '../services/emailService.ts';

const makeBooking = (id: number, email: string) => ({
  id,
  name: 'Test Client',
  email,
  phone: null,
  message: null,
  slotTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  status: 'confirmed',
  googleEventId: null,
  createdAt: new Date(),
  reminderSentAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// sendPendingReminders service
// ─────────────────────────────────────────────
describe('sendPendingReminders', () => {
  it('does nothing when no bookings are in the reminder window', async () => {
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([]);

    await sendPendingReminders();

    expect(sendBookingReminder).not.toHaveBeenCalled();
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('sends a reminder and stamps reminderSentAt for each booking found', async () => {
    const bookings = [makeBooking(1, 'a@test.com'), makeBooking(2, 'b@test.com')];
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce(bookings);
    vi.mocked(sendBookingReminder).mockResolvedValue(undefined);
    vi.mocked(prisma.booking.update).mockResolvedValue(bookings[0] as never);

    await sendPendingReminders();

    expect(sendBookingReminder).toHaveBeenCalledTimes(2);
    expect(prisma.booking.update).toHaveBeenCalledTimes(2);
  });

  it('stamps reminderSentAt with a Date (not null) after sending', async () => {
    const booking = makeBooking(1, 'a@test.com');
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([booking]);
    vi.mocked(sendBookingReminder).mockResolvedValueOnce(undefined);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(booking as never);

    await sendPendingReminders();

    const updateCall = vi.mocked(prisma.booking.update).mock.calls[0][0];
    expect(updateCall.data.reminderSentAt).toBeInstanceOf(Date);
    expect(updateCall.where.id).toBe(1);
  });

  it('continues processing other bookings when one email send fails', async () => {
    const bookings = [makeBooking(1, 'fail@test.com'), makeBooking(2, 'ok@test.com')];
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce(bookings);
    vi.mocked(sendBookingReminder)
      .mockRejectedValueOnce(new Error('Resend down'))  // first fails
      .mockResolvedValueOnce(undefined);                // second succeeds
    vi.mocked(prisma.booking.update).mockResolvedValue(bookings[1] as never);

    await sendPendingReminders();

    // The second booking should still be processed despite the first failing
    expect(sendBookingReminder).toHaveBeenCalledTimes(2);
    expect(prisma.booking.update).toHaveBeenCalledTimes(1); // only stamped for the successful one
  });

  it('queries bookings with the 23–25 hour time window and reminderSentAt: null', async () => {
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([]);

    const before = Date.now();
    await sendPendingReminders();
    const after = Date.now();

    const query = vi.mocked(prisma.booking.findMany).mock.calls[0][0];
    const { gte, lte } = query?.where?.slotTime as { gte: Date; lte: Date };

    // windowStart should be ~23 hours from now
    expect(gte.getTime()).toBeGreaterThanOrEqual(before + 23 * 60 * 60 * 1000);
    expect(gte.getTime()).toBeLessThanOrEqual(after  + 23 * 60 * 60 * 1000);

    // windowEnd should be ~25 hours from now
    expect(lte.getTime()).toBeGreaterThanOrEqual(before + 25 * 60 * 60 * 1000);
    expect(lte.getTime()).toBeLessThanOrEqual(after  + 25 * 60 * 60 * 1000);

    expect(query?.where?.reminderSentAt).toBeNull();
    expect(query?.where?.status).toBe('confirmed');
  });
});
