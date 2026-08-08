import { User } from '@src/models/user.model';
import { Request, Response, NextFunction } from 'express';

import { verifyToken } from '@src/config/jwt';
import { ACCESS_COOKIE } from '@src/services/authToken.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

/** Extract the access token: Bearer header first, session cookie second. */
const extractToken = (req: Request): string => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.split(' ')[1];
  return (req.cookies?.[ACCESS_COOKIE] as string) || '';
};

const authenticate = async (req: Request): Promise<boolean> => {
  const token = extractToken(req);
  if (!token) return false;

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return false;

    // Normalize to a plain object so downstream handlers have a stable shape.
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    };
    return true;
  } catch {
    return false;
  }
};

/**
 * Require a valid access token (Bearer header or httpOnly cookie).
 */
export const protect = async (req: Request, res: Response, next: NextFunction) => {
  if (!(await authenticate(req))) {
    return res.status(HTTP_STATUS_CODES.Unauthorized)
      .json({ message: 'Not authenticated' });
  }
  return next();
};

/**
 * Optional authentication: attaches `req.user` when a valid token is
 * present, otherwise continues as a guest (never rejects).
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  await authenticate(req);
  return next();
};
