import rateLimit from 'express-rate-limit';
import env from '../config/env';

/**
 * Rate limiter for authentication endpoints (`/api/auth/signup`, `/api/auth/login`).
 * Mitigates brute-force credential guessing and signup-spam abuse.
 *
 * Keyed by IP address (express-rate-limit default). Disabled during tests
 * (`NODE_ENV=test`) so integration test suites that create many users in
 * quick succession aren't throttled.
 */
export const authRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});
