import { Router } from 'express';
import { getBookings, createBooking, cancelBooking } from '../controllers/bookingController.ts';
import { requireApiKey } from '../middleware/requireApiKey.ts';

const router = Router();

// GET /api/bookings — trainer-only, requires x-api-key header
router.get('/', requireApiKey, getBookings);

// POST /api/bookings — public (rate-limited at the app level)
router.post('/', createBooking);

// PATCH /api/bookings/:id/cancel — trainer-only, requires x-api-key header
router.patch('/:id/cancel', requireApiKey, cancelBooking);

export default router;
