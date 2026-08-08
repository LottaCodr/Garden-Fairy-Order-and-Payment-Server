import { Request, Response, NextFunction } from 'express';
import { IdempotencyKey } from '@src/models/idempotencyKey';

/**
 * Idempotency support for mutating endpoints.
 *
 * Clients send an `Idempotency-Key` header. The first successful (2xx)
 * response for a (key, endpoint) pair is stored; a replayed request with the
 * same key short-circuits and returns the recorded response/status instead of
 * executing the handler twice.
 *
 * Error responses (non-2xx) are intentionally NOT cached so clients can fix
 * their request and retry with the same key.
 */
export const idempotency = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const key = req.headers['idempotency-key'] as string;

  // Skip requests without an idempotency key
  if (!key) return next();

  try {
    const existing = await IdempotencyKey.findOne({
      key,
      endpoint: req.originalUrl,
    });

    if (existing) {
      return res.status(existing.statusCode).json(existing.response);
    }
  } catch (err) {
    // If the idempotency store is unavailable, fail open and process the
    // request rather than blocking the whole API.
    console.error('Idempotency lookup failed:', err);
    return next();
  }

  // Monkey-patch res.json to capture the response for idempotency replay.
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    // Only cache successful responses; errors may be retried by the client.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      IdempotencyKey.create({
        key,
        endpoint: req.originalUrl,
        statusCode: res.statusCode,
        response: body,
      }).catch((err: unknown) => {
        // Optional: log error, but do not block response
        console.error('Failed to store idempotency record:', err);
      });
    }
    return originalJson(body);
  };

  return next();
};
