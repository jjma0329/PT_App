import { Router } from 'express';
import { trainerLogin } from '../controllers/trainerAuthController.ts';

const router = Router();

// POST /api/auth/login
router.post('/login', trainerLogin);

export default router;
