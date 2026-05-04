import { Router } from 'express';
import { initiateAuth, handleCallback } from '../controllers/authController.ts';
import { requireJwt } from '../middleware/requireJwt.ts';

const router = Router();

// Trainer visits this URL once to kick off Google authorization.
// requireJwt ensures only the logged-in trainer can initiate the OAuth flow.
router.get('/google', requireJwt, initiateAuth);

// Google redirects back here with the authorization code.
// The CSRF state check inside handleCallback protects this endpoint.
router.get('/google/callback', handleCallback);

export default router;
