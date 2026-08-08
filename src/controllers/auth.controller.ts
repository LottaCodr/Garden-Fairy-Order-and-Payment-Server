import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

import { User, IAddress } from '../models/user.model';
import { PasswordResetToken } from '@src/models/passwordResetToken.model';
import { NODE_ENVS } from '@src/common/constants';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import {
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
  SESSION_COOKIE,
} from '@src/services/authToken.service';
import { mergeGuestCart } from '@src/services/cart.service';
import { sendPasswordReset } from '@src/services/mailer.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isDev = process.env.NODE_ENV === NODE_ENVS.Dev;

const publicUser = (user: {
  _id: unknown; name: string; email: string; role: string;
  phone?: string; avatarUrl?: string; addresses?: IAddress[];
}) => ({
  id: (user._id as { toString(): string }).toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  avatarUrl: user.avatarUrl,
  addresses: user.addresses ?? [],
});

/**
 * Complete a successful auth: issue tokens, set cookies, merge any guest
 * cart tied to the session cookie, and return the response body shape.
 */
const completeAuth = async (
  req: Request,
  res: Response,
  user: Parameters<typeof publicUser>[0],
) => {
  const userId = (user._id as { toString(): string }).toString();
  const bundle = await issueTokens(userId);
  setAuthCookies(res, bundle);

  // A guest cart from this browser session follows the user (multi-device).
  await mergeGuestCart(req.cookies?.[SESSION_COOKIE], userId);

  return {
    token: bundle.accessToken,
    refreshToken: bundle.refreshToken,
    user: publicUser(user),
  };
};

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------
export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, phone } = req.body ?? {};

    const errors: string[] = [];
    if (typeof name !== 'string' || !name.trim()) errors.push('name is required');
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      errors.push('a valid email is required');
    }
    if (typeof password !== 'string' || password.length < 6) {
      errors.push('password must be at least 6 characters long');
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

    res.status(HTTP_STATUS_CODES.Created).json(await completeAuth(req, res, user));
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
export const signin = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json(await completeAuth(req, res, user));
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// Refresh (rotate refresh token — sliding expiration)
// ---------------------------------------------------------------------------
export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const presented =
      (req.cookies?.[REFRESH_COOKIE] as string) || req.body?.refreshToken;

    if (!presented || typeof presented !== 'string') {
      return res.status(HTTP_STATUS_CODES.Unauthorized)
        .json({ message: 'No refresh token provided' });
    }

    const rotated = await rotateRefreshToken(presented);
    if (!rotated) {
      clearAuthCookies(res);
      return res.status(HTTP_STATUS_CODES.Unauthorized)
        .json({ message: 'Refresh token invalid or expired' });
    }

    const user = await User.findById(rotated.userId).select('-password');
    if (!user) {
      clearAuthCookies(res);
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ message: 'User not found' });
    }

    setAuthCookies(res, rotated);
    res.json({
      token: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      user: publicUser(user),
    });
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// Sign out — revoke this session, clear cookies
// ---------------------------------------------------------------------------
export const signout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const presented =
      (req.cookies?.[REFRESH_COOKIE] as string) || req.body?.refreshToken;

    if (presented && typeof presented === 'string') {
      await revokeRefreshToken(presented);
    }

    clearAuthCookies(res);
    res.json({ message: 'Signed out' });
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// Dev-only one-click demo login
// ---------------------------------------------------------------------------
export const demoLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isDev) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Not found' });
    }

    const role = req.body?.role === 'admin' ? 'admin' : 'customer';
    const email =
      role === 'admin' ? 'demo-admin@gardenfairy.dev' : 'demo-user@gardenfairy.dev';

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: role === 'admin' ? 'Demo Admin' : 'Demo Customer',
        email,
        password: 'demo-password-1',
        role,
      });
    }

    res.json(await completeAuth(req, res, user));
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body ?? {};

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'a valid email is required' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    const response: Record<string, unknown> = {
      message: 'If that email is registered, a reset link is on its way',
    };

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      await PasswordResetToken.create({
        user: user._id,
        tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      });

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;
      await sendPasswordReset(user.email, resetUrl);

      // Developer convenience: surface the token in dev (no SMTP set up).
      if (isDev) response.devResetToken = rawToken;
    }

    res.json(response);
  } catch (err) { next(err); }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token, password } = req.body ?? {};

    if (typeof token !== 'string' || !token) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'token is required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'password must be at least 6 characters long' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const doc = await PasswordResetToken.findOne({ tokenHash });

    if (!doc || doc.usedAt || doc.expiresAt.getTime() < Date.now()) {
      return res.status(HTTP_STATUS_CODES.Unauthorized)
        .json({ message: 'Reset token invalid or expired' });
    }

    const user = await User.findById(doc.user);
    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized)
        .json({ message: 'Reset token invalid or expired' });
    }

    user.password = password;
    await user.save();

    doc.usedAt = new Date();
    await doc.save();

    // Force re-auth on every session.
    await revokeAllRefreshTokens(user._id.toString());
    clearAuthCookies(res);

    res.json({ message: 'Password updated — please sign in again' });
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export const me = (req: Request, res: Response) => {
  res.json({ user: req.user });
};

/**
 * Update the authenticated user's profile: name, phone, avatar and/or a
 * full replacement of the address book.
 */
export const updateMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phone, avatarUrl, addresses } = req.body ?? {};

    const update: Record<string, unknown> = {};

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
    if (avatarUrl !== undefined) {
      if (typeof avatarUrl !== 'string') {
        return res.status(HTTP_STATUS_CODES.BadRequest)
          .json({ message: 'avatarUrl must be a string' });
      }
      update.avatarUrl = avatarUrl;
    }
    if (addresses !== undefined) {
      const addrError = validateAddresses(addresses);
      if (addrError) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: addrError });
      }
      update.addresses = normalizeAddresses(addresses);
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

// ---------------------------------------------------------------------------
// Address book (sub-resource)
// ---------------------------------------------------------------------------
const validateAddresses = (addresses: unknown): string | null => {
  if (!Array.isArray(addresses)) return 'addresses must be an array';
  if (addresses.length > 10) return 'at most 10 addresses are allowed';
  for (const [i, addr] of (addresses as Record<string, unknown>[]).entries()) {
    if (typeof addr?.street !== 'string' || !addr.street.trim()) {
      return `addresses[${i}].street is required`;
    }
    if (typeof addr?.city !== 'string' || !addr.city.trim()) {
      return `addresses[${i}].city is required`;
    }
    if (typeof addr?.state !== 'string' || !addr.state.trim()) {
      return `addresses[${i}].state is required`;
    }
  }
  return null;
};

const normalizeAddresses = (addresses: Record<string, unknown>[]): IAddress[] => {
  const normalized = addresses.map((addr) => ({
    label: typeof addr.label === 'string' ? addr.label : undefined,
    street: (addr.street as string).trim(),
    city: (addr.city as string).trim(),
    state: (addr.state as string).trim(),
    isDefault: addr.isDefault === true,
  }));
  // Exactly one default; fall back to the first entry as spec frontends do.
  const firstDefault = normalized.findIndex((a) => a.isDefault);
  normalized.forEach((a, i) => {
    a.isDefault = firstDefault === -1 ? i === 0 : i === firstDefault;
  });
  return normalized;
};

export const addAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addrError = validateAddresses([req.body ?? {}]);
    if (addrError) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: addrError });
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'User not found' });
    }
    if (user.addresses.length >= 10) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'at most 10 addresses are allowed' });
    }

    const [addr] = normalizeAddresses([req.body]);
    if (addr.isDefault || user.addresses.length === 0) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      addr.isDefault = true;
    }
    user.addresses.push(addr);
    await user.save();

    res.status(HTTP_STATUS_CODES.Created).json({ addresses: user.addresses });
  } catch (err) { next(err); }
};

export const updateAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'User not found' });
    }

    const addr = user.addresses.find(
      (a) => a._id?.toString() === req.params.addrId,
    );
    if (!addr) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Address not found' });
    }

    const [updated] = normalizeAddresses([
      { ...(addr as unknown as { toObject(): IAddress }).toObject(), ...req.body },
    ]);
    if (updated.isDefault) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      updated.isDefault = true;
    }
    Object.assign(addr, updated);
    await user.save();

    res.json({ addresses: user.addresses });
  } catch (err) { next(err); }
};

export const deleteAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'User not found' });
    }

    const idx = user.addresses.findIndex(
      (a) => a._id?.toString() === req.params.addrId,
    );
    if (idx === -1) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Address not found' });
    }

    const wasDefault = user.addresses[idx].isDefault;
    user.addresses.splice(idx, 1);
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }
    await user.save();

    res.json({ addresses: user.addresses });
  } catch (err) { next(err); }
};
