import jwt, { Secret, SignOptions } from 'jsonwebtoken';

// Single source of truth for JWT config so signing (auth controller) and
// verification (auth middleware) can never drift apart.
export const JWT_SECRET: Secret = process.env.JWT_SECRET || 'dev_secret';

export const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d');

export interface IJwtPayload {
  userId: string;
}

export const signToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign({ userId } satisfies IJwtPayload, JWT_SECRET, options);
};

export const verifyToken = (token: string): IJwtPayload => {
  return jwt.verify(token, JWT_SECRET) as unknown as IJwtPayload;
};
