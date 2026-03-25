import { Router } from 'express';
import { createBooking } from '../controllers/bookingController.ts';

const router = Router();

router.post('/', createBooking);

export default router;
