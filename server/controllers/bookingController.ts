import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { createCalendarEvent } from '../services/calendarService.ts';
import { sendBookingConfirmation, sendBookingNotification } from '../services/emailService.ts';

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

    // Create a Google Calendar event — non-fatal.
    // The booking is already saved; a calendar failure doesn't roll it back.
    try {
      await createCalendarEvent(booking);
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

    res.status(500).json({ success: false, error: 'Failed to create booking.' });
  }
}
