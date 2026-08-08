import { Request, Response, NextFunction } from 'express';
import { IdempotencyKey } from '@src/models/idempotencyKey';

export const idempotency = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const key = req.headers['idempotency-key'] as string;

  // Skip requests without an idempotency key
  if (!key) return next();

  const existing = await IdempotencyKey.findOne({
    key,
    endpoint: req.originalUrl,
  });

  if (existing) {
    return res.status(200).json(existing.response);
  }

  // Monkey-patch res.json to capture the response for idempotency replay
  const originalJson = res.json.bind(res);

  res.json = (body: any) => {
    IdempotencyKey.create({
      key,
      endpoint: req.originalUrl,
      response: body,
    }).catch((err: any) => {
      // Optional: log error, but do not block response
      console.error('Failed to store idempotency record:', err);
    });
    return originalJson(body);
  };

  return next();
};
