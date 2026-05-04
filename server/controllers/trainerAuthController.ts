import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// POST /api/auth/login
// Validates trainer credentials against env-stored values and returns a signed JWT.
// Uses the same generic error message for wrong email AND wrong password — this
// prevents an attacker from learning which field was incorrect (user enumeration).
export async function trainerLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    res.status(400).json({ success: false, error: 'Email and password are required.' });
    return;
  }

  const expectedEmail = process.env.ADMIN_EMAIL;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const jwtSecret = process.env.JWT_SECRET;

  if (!expectedEmail || !passwordHash || !jwtSecret) {
    res.status(503).json({ success: false, error: 'Admin credentials not configured.' });
    return;
  }

  // Case-insensitive email match
  const emailMatch = email.trim().toLowerCase() === expectedEmail.toLowerCase();

  // Always run bcrypt.compare even if email is wrong — this keeps response time
  // constant and prevents timing attacks from revealing which field failed.
  const passwordMatch = await bcrypt.compare(password, passwordHash);

  if (!emailMatch || !passwordMatch) {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }

  // role: 'trainer' is the only claim we need — no user ID, no PII in the token
  const token = jwt.sign({ role: 'trainer' }, jwtSecret, { expiresIn: '24h' });
  res.json({ success: true, data: { token } });
}
