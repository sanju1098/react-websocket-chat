// Ensures required env vars are present before any module (e.g. env.ts) loads during tests.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/realtime-chat-test';

// Short socket rate-limit window in tests so the "window reset" test doesn't
// need to wait 10 real seconds (production default). Small enough to keep
// the suite fast, large enough to reliably assert on the pre-reset state.
process.env.SOCKET_RATE_LIMIT_WINDOW_MS = process.env.SOCKET_RATE_LIMIT_WINDOW_MS || '500';
process.env.SOCKET_RATE_LIMIT_MAX = process.env.SOCKET_RATE_LIMIT_MAX || '10';
