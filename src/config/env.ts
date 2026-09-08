import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
  nodeEnv: string;
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  clientOrigin: string;
  redisUrl: string;
  redisEnabled: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  socketRateLimitMax: number;
  socketRateLimitWindowMs: number;
}

const required = ['MONGODB_URI', 'JWT_SECRET'] as const;

function validateEnv(): void {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Warning: missing environment variables: ${missing.join(', ')}. Using defaults where possible.`
    );
  }
}

validateEnv();

const env: EnvConfig = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/realtime-chat',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Opt-in: Redis adapter is only needed for multi-instance horizontal
  // scaling. Defaults to disabled so local single-instance dev/tests don't
  // require a running Redis server.
  redisEnabled: process.env.REDIS_ENABLED === 'true',
  // REST rate limiting (express-rate-limit) - applied to auth endpoints.
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,
  // Socket.io rate limiting - applied to `message:send` per socket.
  socketRateLimitMax: Number(process.env.SOCKET_RATE_LIMIT_MAX) || 10,
  socketRateLimitWindowMs: Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS) || 10 * 1000,
};

export default env;
