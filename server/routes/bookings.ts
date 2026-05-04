import { Router } from 'express';
import { getBookings, createBooking, cancelBooking, rescheduleBooking } from '../controllers/bookingController.ts';
import { requireJwt } from '../middleware/requireJwt.ts';

const router = Router();

// GET /api/bookings — trainer-only, requires valid JWT
router.get('/', requireJwt, getBookings);

// POST /api/bookings — public (rate-limited at the app level)
router.post('/', createBooking);

// PATCH /api/bookings/:id/cancel — trainer-only, requires valid JWT
router.patch('/:id/cancel', requireJwt, cancelBooking);

// PATCH /api/bookings/:id/reschedule — trainer-only, requires valid JWT
router.patch('/:id/reschedule', requireJwt, rescheduleBooking);

export default router;
