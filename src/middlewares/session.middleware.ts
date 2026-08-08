import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

import { SESSION_COOKIE } from '@src/services/authToken.service';
import { NODE_ENVS } from '@src/common/constants';

const isProd = process.env.NODE_ENV === NODE_ENVS.Production;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Guarantee a guest session id (httpOnly cookie) for cart/checkout routes.
 * Use after `optionalAuth`; when the request is authenticated the user id
 * wins and the session is only a fallback.
 */
export const ensureSession = (req: Request, res: Response, next: NextFunction) => {
  let sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;

  if (!sessionId) {
    sessionId = randomUUID();
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
  }

  req.sessionId = sessionId;
  return next();
};
