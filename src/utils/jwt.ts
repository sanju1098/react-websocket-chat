import jwt, { SignOptions } from 'jsonwebtoken';
import env from '../config/env';

export interface JwtPayload {
  userId: string;
  username: string;
  email: string;
}

/**
 * Signs a JWT for the given user payload. Used for both REST auth
 * (Authorization header) and Socket.io handshake auth (Phase 2+).
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
}

/**
 * Verifies a JWT and returns its decoded payload.
 * Throws a jsonwebtoken error (caught by callers) if invalid/expired.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}
