import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Protects trainer-only routes by verifying the JWT sent in the Authorization header.
// Expected format: Authorization: Bearer <token>
// Returns 401 for missing, malformed, expired, or tampered tokens.
export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  const token = authHeader.slice(7); // strip 'Bearer '
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(503).json({ success: false, error: 'Auth not configured.' });
    return;
  }

  try {
    // verify() throws if the token is expired, tampered, or uses the wrong secret
    jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}
