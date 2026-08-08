import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { signToken } from '@src/config/jwt';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (user: {
  _id: unknown; name: string; email: string; role: string; phone?: string;
}) => ({
  id: (user._id as { toString(): string }).toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
});

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, phone } = req.body ?? {};

    const errors: string[] = [];
    if (typeof name !== 'string' || !name.trim()) errors.push('name is required');
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      errors.push('a valid email is required');
    }
    if (typeof password !== 'string' || password.length < 8) {
      errors.push('password must be at least 8 characters long');
    }
    if (phone !== undefined && typeof phone !== 'string') {
      errors.push('phone must be a string');
    }
    if (errors.length) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: errors.join('; ') });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(HTTP_STATUS_CODES.Conflict).json({ message: 'Email already registered' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone,
    });
    const token = signToken(user._id.toString());

    res.status(HTTP_STATUS_CODES.Created).json({
      token,
      user: publicUser(user),
    });
  } catch (err) { next(err); }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ message: 'Invalid credentials' });
    }
    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ message: 'Invalid credentials' });
    }
    const token = signToken(user._id.toString());
    res.json({ token, user: publicUser(user) });
  } catch (err) { next(err); }
};

export const me = (req: Request, res: Response) => {
  // user is attached by auth middleware
  res.json({ user: req.user });
};

/**
 * Update the authenticated user's profile (name/phone).
 */
export const updateMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phone } = req.body ?? {};

    const update: Record<string, string> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(HTTP_STATUS_CODES.BadRequest)
          .json({ message: 'name must be a non-empty string' });
      }
      update.name = name.trim();
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        return res.status(HTTP_STATUS_CODES.BadRequest)
          .json({ message: 'phone must be a string' });
      }
      update.phone = phone;
    }
    if (!Object.keys(update).length) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'nothing to update' });
    }

    const user = await User.findByIdAndUpdate(req.user!.id, update, { new: true });
    if (!user) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'User not found' });
    }

    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
};
