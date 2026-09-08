// Augments Express's Request type to carry the authenticated user's JWT payload.
// Populated by `authMiddleware` after successful token verification.
import { JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
