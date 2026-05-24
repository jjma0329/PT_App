import { Router } from 'express';
import { initiateAuth, handleCallback, getAuthUrlForClient } from '../controllers/authController.ts';
import { requireJwt } from '../middleware/requireJwt.ts';

const router = Router();

// Trainer visits this URL once to kick off Google authorization.
// requireJwt ensures only the logged-in trainer can initiate the OAuth flow.
router.get('/google', requireJwt, initiateAuth);

// Returns the Google auth URL as JSON — used by the admin UI button.
// The frontend fetches this (with JWT header), then redirects window.location to the URL.
router.get('/google/url', requireJwt, getAuthUrlForClient);

// Google redirects back here with the authorization code.
// The CSRF state check inside handleCallback protects this endpoint.
router.get('/google/callback', handleCallback);

export default router;
