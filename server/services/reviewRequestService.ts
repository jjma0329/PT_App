import { prisma } from '../lib/prisma.ts';
import { sendReviewRequest } from './emailService.js';

/**
 * Finds confirmed bookings whose session ended 1–7 days ago and haven't
 * received a review request yet, then emails each client a review link
 * and stamps reviewRequestSentAt.
 *
 * Lower bound (1h ago): give the session time to actually end before emailing.
 * Upper bound (7 days ago): avoids retroactively emailing clients for old
 * sessions if the server was offline or this feature was just deployed.
 */
export async function sendPendingReviewRequests(): Promise<void> {
  const now = new Date();

  // Sessions that ended at least 1 hour ago
  const windowEnd   = new Date(now.getTime() - 1  * 60 * 60 * 1000);
  // Sessions that ended no more than 7 days ago
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
      slotTime: {
        lte: windowEnd,    // session has already ended
        gte: windowStart,  // but not more than 7 days ago
      },
      reviewRequestSentAt: null,
    },
  });

  for (const booking of bookings) {
    try {
      await sendReviewRequest({
        name:     booking.name,
        email:    booking.email,
        phone:    booking.phone,
        message:  booking.message,
        slotTime: booking.slotTime,
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data:  { reviewRequestSentAt: new Date() },
      });

      console.log(`[review-requests] sent review request to ${booking.email} for slot ${booking.slotTime.toISOString()}`);
    } catch (err) {
      console.error(`[review-requests] failed for booking ${booking.id}:`, err);
    }
  }
}
