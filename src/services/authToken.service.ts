import crypto from 'crypto';
import { Response } from 'express';
import { Types } from 'mongoose';

import { RefreshToken } from '@src/models/refreshToken.model';
import { signToken } from '@src/config/jwt';
import { NODE_ENVS } from '@src/common/constants';

export const ACCESS_COOKIE = 'gf_access';
export const REFRESH_COOKIE = 'gf_refresh';
export const SESSION_COOKIE = 'gf_session';

const REFRESH_TTL_DAYS = 30;

const isProd = process.env.NODE_ENV === NODE_ENVS.Production;

const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
};

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

export interface ITokenBundle {
  accessToken: string;
  refreshToken: string;
}

/**
 * Issue a fresh access token + refresh token (persisted hashed).
 */
export const issueTokens = async (userId: string): Promise<ITokenBundle> => {
  const accessToken = signToken(userId);
  const refreshToken = crypto.randomBytes(48).toString('hex');

  await RefreshToken.create({
    user: new Types.ObjectId(userId),
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken };
};

/**
 * Rotate a refresh token (sliding expiration): the presented token is
 * revoked and a brand new pair is returned. Returns null when the token is
 * unknown, expired or already revoked (in which case the whole family is
 * revoked as a reuse precaution).
 */
export const rotateRefreshToken = async (
  presentedToken: string,
): Promise<(ITokenBundle & { userId: string }) | null> => {
  const doc = await RefreshToken.findOne({
    tokenHash: hashToken(presentedToken),
  });

  if (!doc) return null;

  if (doc.revokedAt || doc.expiresAt.getTime() < Date.now()) {
    // Possible reuse — revoke every session of this user.
    if (doc.revokedAt) {
      await RefreshToken.updateMany(
        { user: doc.user, revokedAt: { $exists: false } },
        { revokedAt: new Date() },
      );
    }
    return null;
  }

  const bundle = await issueTokens(doc.user.toString());

  doc.revokedAt = new Date();
  doc.replacedByHash = hashToken(bundle.refreshToken);
  await doc.save();

  return { ...bundle, userId: doc.user.toString() };
};

/**
 * Revoke one refresh token (sign out of this session).
 */
export const revokeRefreshToken = async (token: string) => {
  await RefreshToken.findOneAndUpdate(
    { tokenHash: hashToken(token), revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
};

/**
 * Revoke every refresh token of a user (sign out everywhere / password reset).
 */
export const revokeAllRefreshTokens = async (userId: string) => {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
};

/**
 * Write the session cookies on a response.
 */
export const setAuthCookies = (res: Response, bundle: ITokenBundle) => {
  res.cookie(ACCESS_COOKIE, bundle.accessToken, {
    ...baseCookieOptions,
    maxAge: 24 * 60 * 60 * 1000, // matches default 1d JWT expiry ceiling
    path: '/',
  });
  res.cookie(REFRESH_COOKIE, bundle.refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions, path: '/api/auth' });
};
