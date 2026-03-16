import { Router } from 'express';
import { initiateAuth, handleCallback } from '../controllers/authController.ts';

const router = Router();

// Trainer visits this URL once to kick off Google authorization
router.get('/google', initiateAuth);

// Google redirects back here with the authorization code
router.get('/google/callback', handleCallback);

export default router;
