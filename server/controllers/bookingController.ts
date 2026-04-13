import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { createCalendarEvent, deleteCalendarEvent } from '../services/calendarService.ts';
import { sendBookingConfirmation, sendBookingNotification, sendCancellationNotification } from '../services/emailService.ts';

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

    res.status(201).json({ success: true, data: booking });
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

    // Notify the trainer — non-fatal.
    try {
      await sendCancellationNotification(booking);
    } catch (emailErr) {
      console.error('Cancellation notification email failed:', emailErr);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('cancelBooking error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel booking.' });
  }
}
