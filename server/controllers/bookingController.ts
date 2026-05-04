import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { createCalendarEvent, deleteCalendarEvent } from '../services/calendarService.ts';
import { sendBookingConfirmation, sendBookingNotification, sendCancellationNotification, sendClientCancellationEmail } from '../services/emailService.ts';

// Returns true if the error is a Prisma unique constraint violation (P2002).
// This is the DB-level double-booking protection — it fires if two requests
// slip through the API-level check simultaneously.
function isPrismaUniqueError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    err.code === 'P2002'
  );
}

// GET /api/bookings
// Returns all bookings ordered by slotTime descending (most recent first).
// Protected by requireApiKey middleware — trainer use only.
export async function getBookings(req: Request, res: Response): Promise<void> {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { slotTime: 'desc' },
    });
    res.json({ success: true, data: bookings });
  } catch (err) {
    console.error('getBookings error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings.' });
  }
}

// POST /api/bookings
// Expects: { name, email, phone?, message?, slotTime }
// Where slotTime is an ISO datetime string (e.g. "2026-03-20T18:00:00.000Z")
export async function createBooking(req: Request, res: Response): Promise<void> {
  const { name, email, phone, message, slotTime } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
    slotTime?: string;
  };

  // --- Validation ---

  if (!name?.trim() || !email?.trim() || !slotTime) {
    res.status(400).json({ success: false, error: 'name, email, and slotTime are required.' });
    return;
  }

  if (name.trim().length > 100) {
    res.status(400).json({ success: false, error: 'name must be 100 characters or fewer.' });
    return;
  }

  if (phone && phone.trim().length > 20) {
    res.status(400).json({ success: false, error: 'phone must be 20 characters or fewer.' });
    return;
  }

  if (message && message.trim().length > 2000) {
    res.status(400).json({ success: false, error: 'message must be 2000 characters or fewer.' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    res.status(400).json({ success: false, error: 'Invalid email address.' });
    return;
  }

  const slotDate = new Date(slotTime);
  if (isNaN(slotDate.getTime())) {
    res.status(400).json({ success: false, error: 'slotTime must be a valid ISO datetime string.' });
    return;
  }

  // Reject slots in the past — the frontend enforces a 2-day minimum but this
  // catches direct API calls that skip the UI
  if (slotDate <= new Date()) {
    res.status(400).json({ success: false, error: 'slotTime must be a future date and time.' });
    return;
  }

  try {
    // API-level double-booking check — catches the common case before hitting the DB write.
    // The @unique constraint on Booking.slotTime is the safety net for race conditions.
    const existing = await prisma.booking.findUnique({ where: { slotTime: slotDate } });
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'This time slot has already been booked. Please choose another time.',
      });
      return;
    }

    // Save the booking. If two requests race past the check above, the DB unique
    // constraint will reject the second write with a P2002 error (caught below).
    const booking = await prisma.booking.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        message: message?.trim() || null,
        slotTime: slotDate,
      },
    });

    // Create a Google Calendar event and store its ID — non-fatal.
    // The booking is already saved; a calendar failure doesn't roll it back.
    // We store the event ID so we can delete the event if the booking is cancelled.
    try {
      const googleEventId = await createCalendarEvent(booking);
      if (googleEventId) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { googleEventId },
        });
      }
    } catch (calErr) {
      console.error('Google Calendar event creation failed:', calErr);
    }

    // Send confirmation to visitor + notification to trainer — also non-fatal.
    try {
      await sendBookingConfirmation(booking);
      await sendBookingNotification(booking);
    } catch (emailErr) {
      console.error('Booking emails failed:', emailErr);
    }

    // Return only public-safe fields — never expose googleEventId, cron timestamps, etc.
    res.status(201).json({
      success: true,
      data: {
        id:       booking.id,
        name:     booking.name,
        email:    booking.email,
        slotTime: booking.slotTime,
        status:   booking.status,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation at the DB level (race condition double-booking)
    if (isPrismaUniqueError(err)) {
      res.status(409).json({
        success: false,
        error: 'This time slot has already been booked. Please choose another time.',
      });
      return;
    }

    console.error('createBooking error:', err);
    res.status(500).json({ success: false, error: 'Failed to create booking.' });
  }
}

// PATCH /api/bookings/:id/reschedule
// Expects: { newSlotTime: ISO string }
// Moves a confirmed booking to a new slot:
//   1. Validates and conflict-checks the new slot
//   2. Updates slotTime and resets reminderSentAt (so reminder fires again for the new time)
//   3. Replaces the Google Calendar event (delete old, create new) — non-fatal
// Protected by requireJwt — trainer use only.
export async function rescheduleBooking(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid booking ID.' });
    return;
  }

  const { newSlotTime } = req.body as { newSlotTime?: string };

  if (!newSlotTime) {
    res.status(400).json({ success: false, error: 'newSlotTime is required.' });
    return;
  }

  const newSlotDate = new Date(newSlotTime);
  if (isNaN(newSlotDate.getTime())) {
    res.status(400).json({ success: false, error: 'newSlotTime must be a valid ISO datetime string.' });
    return;
  }

  try {
    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found.' });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(409).json({ success: false, error: 'Cannot reschedule a cancelled booking.' });
      return;
    }

    // Reject if the trainer picked the same slot the booking already has
    if (booking.slotTime.getTime() === newSlotDate.getTime()) {
      res.status(409).json({ success: false, error: 'New slot is the same as the current slot.' });
      return;
    }

    // Check that no other active booking already occupies the new slot.
    // We exclude cancelled bookings — they don't hold a slot.
    const conflict = await prisma.booking.findFirst({
      where: {
        slotTime: newSlotDate,
        id: { not: id },
        status: { not: 'cancelled' },
      },
    });

    if (conflict) {
      res.status(409).json({ success: false, error: 'That time slot is already booked.' });
      return;
    }

    // Update the booking:
    //   - slotTime: the new time
    //   - reminderSentAt: reset so the cron sends a fresh reminder 24h before the new slot
    //   - reviewRequestSentAt: reset so the review email fires after the rescheduled session
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        slotTime:            newSlotDate,
        reminderSentAt:      null,
        reviewRequestSentAt: null,
      },
    });

    // Replace the Google Calendar event — non-fatal.
    // Delete the old event first, then create a new one for the new slot.
    if (booking.googleEventId) {
      try {
        await deleteCalendarEvent(booking.googleEventId);
      } catch (calErr) {
        console.error('Google Calendar event deletion failed during reschedule:', calErr);
      }
    }

    try {
      const newGoogleEventId = await createCalendarEvent({
        name:     updated.name,
        email:    updated.email,
        phone:    updated.phone,
        message:  updated.message,
        slotTime: updated.slotTime,
      });

      if (newGoogleEventId) {
        await prisma.booking.update({
          where: { id },
          data: { googleEventId: newGoogleEventId },
        });
        updated.googleEventId = newGoogleEventId;
      }
    } catch (calErr) {
      console.error('Google Calendar event creation failed during reschedule:', calErr);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    // P2002 = unique constraint race — two reschedule requests landed on the same slot simultaneously
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ success: false, error: 'That time slot is already booked.' });
      return;
    }

    console.error('rescheduleBooking error:', err);
    res.status(500).json({ success: false, error: 'Failed to reschedule booking.' });
  }
}

// PATCH /api/bookings/:id/cancel
// Sets the booking status to "cancelled", removes the Google Calendar event,
// and sends a cancellation notification to the trainer.
// Protected by requireApiKey — trainer use only.
export async function cancelBooking(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid booking ID.' });
    return;
  }

  try {
    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found.' });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(409).json({ success: false, error: 'Booking is already cancelled.' });
      return;
    }

    // Mark as cancelled in the DB — this is the source of truth
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Delete the Google Calendar event — non-fatal.
    // If the event was already deleted manually, Google returns 410 Gone — we log and move on.
    if (booking.googleEventId) {
      try {
        await deleteCalendarEvent(booking.googleEventId);
      } catch (calErr) {
        console.error('Google Calendar event deletion failed:', calErr);
      }
    }

    // Notify the trainer and the client — both non-fatal.
    try {
      await sendCancellationNotification(booking);
    } catch (emailErr) {
      console.error('Trainer cancellation notification email failed:', emailErr);
    }

    try {
      await sendClientCancellationEmail(booking);
    } catch (emailErr) {
      console.error('Client cancellation email failed:', emailErr);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('cancelBooking error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel booking.' });
  }
}
