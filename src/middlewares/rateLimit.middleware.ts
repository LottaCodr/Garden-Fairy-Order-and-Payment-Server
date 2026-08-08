import { Request, Response, NextFunction } from 'express';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

interface IBucket {
  count: number;
  resetAt: number;
}

interface IRateLimitOptions {
  windowMs: number;
  max: number;
  key: string; // bucket prefix per protected route group
}

const buckets = new Map<string, IBucket>();

// Periodic cleanup so the map can't grow unbounded (unref'd — never keeps
// the process alive, e.g. in tests).
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000);
sweeper.unref?.();

/**
 * Naive fixed-window in-memory rate limiter (per ip + route group).
 * Suitable for a single-process deployment; swap for Redis in multi-node
 * setups (e.g. Upstash).
 */
export const rateLimit = ({ windowMs, max, key }: IRateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = req.ip || req.socket.remoteAddress || 'unknown';
    const bucketKey = `${key}:${identity}`;
    const now = Date.now();

    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(HTTP_STATUS_CODES.TooManyRequests).json({
        message: 'Too many requests — please slow down and try again shortly',
      });
    }

    return next();
  };
};

// Presets matching the security checklist (e.g. 5 sign-in attempts/min).
export const limitSignin = rateLimit({ windowMs: 60_000, max: 5, key: 'signin' });
export const limitSignup = rateLimit({ windowMs: 60_000, max: 10, key: 'signup' });
export const limitPasswordReset = rateLimit({
  windowMs: 5 * 60_000,
  max: 5,
  key: 'pwd-reset',
});
export const limitContact = rateLimit({ windowMs: 60_000, max: 5, key: 'contact' });
export const limitNewsletter = rateLimit({
  windowMs: 60_000,
  max: 10,
  key: 'newsletter',
});
export const limitCheckout = rateLimit({
  windowMs: 60_000,
  max: 20,
  key: 'checkout',
});
