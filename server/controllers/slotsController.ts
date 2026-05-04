import { Request, Response } from 'express';
import { getAvailableSlots } from '../services/calendarService.ts';

// Validates the date query param and returns available time slots.
// Expected: GET /api/slots?date=YYYY-MM-DD
export async function getSlots(req: Request, res: Response): Promise<void> {
  const { date } = req.query as { date?: string };

  if (!date) {
    res.status(400).json({ success: false, error: 'date query param is required (YYYY-MM-DD).' });
    return;
  }

  // Validate format — reject anything that doesn't look like a real date
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
  if (!isValidDate) {
    res.status(400).json({ success: false, error: 'date must be in YYYY-MM-DD format.' });
    return;
  }

  try {
    const slots = await getAvailableSlots(date);
    res.json({ success: true, data: slots });
  } catch (err) {
    // Log the real error server-side; never expose internal messages to clients
    console.error('getSlots error:', err);
    res.status(500).json({ success: false, error: 'Unable to fetch available slots.' });
  }
}
