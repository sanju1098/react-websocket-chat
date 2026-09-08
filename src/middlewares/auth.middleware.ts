import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler.middleware';

/**
 * Protects REST routes by requiring a valid `Authorization: Bearer <token>` header.
 * On success, attaches the decoded JWT payload to `req.user`.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Authentication required: missing or malformed Authorization header', 401));
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    next(new AppError('Authentication failed: invalid or expired token', 401));
  }
}
