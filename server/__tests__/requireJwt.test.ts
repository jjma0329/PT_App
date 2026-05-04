import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireJwt } from '../middleware/requireJwt.ts';

// Build minimal mock req/res/next objects — only what the middleware touches.
function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes() {
  // Chain res.status().json() by returning the same res object from status()
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('requireJwt middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    // vitest.config.ts sets JWT_SECRET = 'test-jwt-secret' for all tests
  });

  it('calls next() when a valid Bearer token is provided', () => {
    const token = jwt.sign({ role: 'trainer' }, 'test-jwt-secret', { expiresIn: '1h' });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const res = makeRes();

    requireJwt(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when no Authorization header is sent', () => {
    const req = makeReq();
    const res = makeRes();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the header does not start with "Bearer "', () => {
    const token = jwt.sign({ role: 'trainer' }, 'test-jwt-secret');
    const req = makeReq({ authorization: `Token ${token}` });
    const res = makeRes();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is tampered / invalid', () => {
    const req = makeReq({ authorization: 'Bearer not.a.real.token' });
    const res = makeRes();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid or expired token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is signed with the wrong secret', () => {
    const badToken = jwt.sign({ role: 'trainer' }, 'wrong-secret', { expiresIn: '1h' });
    const req = makeReq({ authorization: `Bearer ${badToken}` });
    const res = makeRes();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is expired', () => {
    // Sign with expiresIn: 0 so it's already expired
    const expiredToken = jwt.sign({ role: 'trainer' }, 'test-jwt-secret', { expiresIn: 0 });
    const req = makeReq({ authorization: `Bearer ${expiredToken}` });
    const res = makeRes();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 503 when JWT_SECRET env var is not configured', () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    const token = jwt.sign({ role: 'trainer' }, 'test-jwt-secret');
    const req = makeReq({ authorization: `Bearer ${token}` });
    const res = makeRes();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Auth not configured.' });
    expect(next).not.toHaveBeenCalled();

    // Restore so other tests are unaffected
    process.env.JWT_SECRET = original;
  });
});
