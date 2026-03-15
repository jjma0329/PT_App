import { Router } from 'express';
import { getSlots } from '../controllers/slotsController.ts';

const router = Router();

router.get('/', getSlots);

export default router;
