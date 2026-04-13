import { Request, Response, NextFunction } from 'express';

// Simple API key guard for trainer-only routes (e.g. GET /api/bookings).
// The key is set via the ADMIN_API_KEY env var and must be sent in the
// x-api-key request header. This isn't a full auth system — it's a
// lightweight lock appropriate for a solo trainer tool where the only
// "admin" is the person running the server.
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    // If ADMIN_API_KEY isn't set, fail closed — don't expose data.
    res.status(503).json({ success: false, error: 'Admin access is not configured.' });
    return;
  }

  if (!key || key !== expected) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  next();
}
