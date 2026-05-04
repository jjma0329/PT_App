import { prisma } from '../lib/prisma.ts';
import { sendBookingReminder } from './emailService.js';

/**
 * Finds all confirmed bookings whose slotTime falls within the 23–25 hour
 * window from now and haven't had a reminder sent yet, then sends each client
 * a reminder email and stamps reminderSentAt.
 *
 * The 2-hour window (not exactly 24h) gives the hourly cron job a safe margin:
 * even if a run fires a few minutes late, no booking slips through the cracks.
 */
export async function sendPendingReminders(): Promise<void> {
  const now = new Date();

  // Lower bound: 23 hours from now
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  // Upper bound: 25 hours from now
  const windowEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Find confirmed bookings that fall in the window and haven't been reminded yet.
  // reminderSentAt: null is the "not yet sent" guard — prevents double-sends.
  const bookings = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
      slotTime: {
        gte: windowStart,
        lte: windowEnd,
      },
      reminderSentAt: null,
    },
  });

  for (const booking of bookings) {
    try {
      await sendBookingReminder({
        name:     booking.name,
        email:    booking.email,
        phone:    booking.phone,
        message:  booking.message,
        slotTime: booking.slotTime,
      });

      // Stamp the booking immediately after a successful send.
      // If this update fails (rare DB error), the email was still sent — the next
      // cron run will attempt to send again, which is a minor duplicate but
      // better than silently swallowing the error.
      await prisma.booking.update({
        where: { id: booking.id },
        data:  { reminderSentAt: new Date() },
      });

      console.log(`[reminders] sent reminder to ${booking.email} for slot ${booking.slotTime.toISOString()}`);
    } catch (err) {
      // Log and continue — one failed send shouldn't block the rest of the batch.
      console.error(`[reminders] failed for booking ${booking.id}:`, err);
    }
  }
}
