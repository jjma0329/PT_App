import { Request, Response } from 'express';
import { getAuthUrl, saveTokensFromCode } from '../services/calendarService.ts';

// Step 1: Redirect the trainer to Google's consent screen.
// We store a random 'state' value in the session to verify the callback isn't forged.
export function initiateAuth(req: Request, res: Response): void {
  const state = Math.random().toString(36).slice(2);
  req.session.oauthState = state;

  // Explicitly save the session before redirecting — without this, the session
  // write and the redirect can race, and the cookie may not be set in time.
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ success: false, error: 'Session error.' });
      return;
    }
    const url = getAuthUrl(state);
    res.redirect(url);
  });
}

// Step 2: Google redirects back here after the trainer grants (or denies) access.
// We verify the state, exchange the code for tokens, and save them to the DB.
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  // Trainer denied access on the consent screen
  if (error) {
    res.status(400).json({ success: false, error: 'Google authorization was denied.' });
    return;
  }

  // State mismatch means the request didn't originate from our server — reject it
  if (!state || state !== req.session.oauthState) {
    res.status(403).json({ success: false, error: 'Invalid state parameter.' });
    return;
  }

  if (!code) {
    res.status(400).json({ success: false, error: 'No authorization code received.' });
    return;
  }

  try {
    await saveTokensFromCode(code);
    // Clear the state from session — it's single-use
    req.session.oauthState = undefined;
    res.json({ success: true, data: 'Google Calendar authorization complete.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to save authorization tokens.' });
  }
}
