import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireApiKey } from '../middleware/requireApiKey.ts';

// Build minimal mock req/res/next objects — we only need what the middleware touches.
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

describe('requireApiKey middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    // vitest.config.ts sets ADMIN_API_KEY = 'test-api-key' for all tests
  });

  it('calls next() when the correct API key is provided', () => {
    const req = makeReq({ 'x-api-key': 'test-api-key' });
    const res = makeRes();

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when no x-api-key header is sent', () => {
    const req = makeReq();
    const res = makeRes();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the wrong API key is sent', () => {
    const req = makeReq({ 'x-api-key': 'wrong-key' });
    const res = makeRes();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 503 when ADMIN_API_KEY is not configured', () => {
    const original = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;

    const req = makeReq({ 'x-api-key': 'test-api-key' });
    const res = makeRes();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Admin access is not configured.',
    });
    expect(next).not.toHaveBeenCalled();

    // Restore so other tests aren't affected
    process.env.ADMIN_API_KEY = original;
  });
});
