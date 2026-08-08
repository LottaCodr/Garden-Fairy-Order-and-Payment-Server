import { User } from '@src/models/user.model';
import { Request, Response, NextFunction } from 'express';

import { verifyToken } from '@src/config/jwt';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

/**
 * Authenticate the request via the `Authorization: Bearer <token>` header.
 * Attaches a normalized `req.user` object ({ id, name, email, role, phone }).
 */
export const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token = '';

  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ message: 'Not authenticated' });
  }

  try {
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ message: 'User not found' });
    }

    // Normalize to a plain object so downstream handlers have a stable shape.
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    };

    next();
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ message: 'Token expired' });
    }
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ message: 'Token invalid or expired' });
  }
};
