import { checkMessageRateLimit } from '../../src/middlewares/socketRateLimit.middleware';
import env from '../../src/config/env';

describe('checkMessageRateLimit', () => {
  it('allows requests up to the configured max within the window', () => {
    const userId = `rl-user-${Date.now()}-1`;

    for (let i = 0; i < env.socketRateLimitMax; i += 1) {
      expect(checkMessageRateLimit(userId)).toBe(true);
    }
  });

  it('rejects requests beyond the configured max within the same window (edge case)', () => {
    const userId = `rl-user-${Date.now()}-2`;

    for (let i = 0; i < env.socketRateLimitMax; i += 1) {
      checkMessageRateLimit(userId);
    }

    expect(checkMessageRateLimit(userId)).toBe(false);
  });

  it('resets the counter for a new window after the window elapses', async () => {
    const userId = `rl-user-${Date.now()}-3`;

    for (let i = 0; i < env.socketRateLimitMax; i += 1) {
      checkMessageRateLimit(userId);
    }
    expect(checkMessageRateLimit(userId)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, env.socketRateLimitWindowMs + 50));

    expect(checkMessageRateLimit(userId)).toBe(true);
  }, 15000);

  it('tracks separate users independently (edge case)', () => {
    const userA = `rl-user-${Date.now()}-4a`;
    const userB = `rl-user-${Date.now()}-4b`;

    for (let i = 0; i < env.socketRateLimitMax; i += 1) {
      checkMessageRateLimit(userA);
    }

    expect(checkMessageRateLimit(userA)).toBe(false);
    expect(checkMessageRateLimit(userB)).toBe(true);
  });
});
