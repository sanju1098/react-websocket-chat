import { Socket } from 'socket.io';
import env from '../config/env';
import logger from '../utils/logger';

type SocketMiddlewareNext = (err?: Error) => void;

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

/**
 * Per-user sliding-window counters for `message:send` abuse prevention.
 * Keyed by userId (not socketId) so a user can't bypass the limit by
 * opening multiple simultaneous connections/tabs.
 *
 * NOTE: Like presence.service.ts's connection tracking, this is
 * process-local in-memory state. In a multi-instance deployment, each
 * instance enforces its own independent limit (so the effective global
 * limit is `perInstanceLimit * instanceCount`) unless migrated to a
 * shared store (e.g. Redis `INCR` + `EXPIRE`). Acceptable for this
 * project's scope; documented here for future hardening.
 */
const buckets = new Map<string, RateLimitBucket>();

/**
 * Returns `true` if the given user is currently within their allowed
 * `message:send` rate (sliding window: `socketRateLimitMax` sends per
 * `socketRateLimitWindowMs`), incrementing their counter as a side effect.
 * Returns `false` if the limit has been exceeded for the current window.
 */
export function checkMessageRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(userId);

  if (!bucket || now - bucket.windowStart >= env.socketRateLimitWindowMs) {
    buckets.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= env.socketRateLimitMax) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/**
 * Socket.io connection middleware slot reserved for future per-connection
 * setup related to rate limiting (e.g. attaching a rate-limit-aware logger).
 * Currently a no-op passthrough; the actual limit check happens per-event
 * in message.handler.ts via `checkMessageRateLimit()`, since Socket.io
 * middleware (`io.use`) only runs once per CONNECTION, not per EVENT, and
 * rate limiting must be applied per `message:send` call.
 */
export function socketRateLimitMiddleware(socket: Socket, next: SocketMiddlewareNext): void {
  logger.debug(`Rate limit tracking active for socket ${socket.id}`);
  next();
}
