import { Request, Response, NextFunction } from 'express';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !roles.includes(user.role)) {
      return res.status(HTTP_STATUS_CODES.Forbidden)
        .json({ message: 'Forbidden. Insufficient permissions' });
    }
    next();
  };
};
