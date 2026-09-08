import { createClient, RedisClientType } from 'redis';
import env from './env';
import logger from '../utils/logger';

let pubClient: RedisClientType | undefined;
let subClient: RedisClientType | undefined;

/**
 * Creates and connects the pub/sub Redis client pair required by
 * `@socket.io/redis-adapter`. Two separate connections are required by
 * the adapter's design: one dedicated to publishing, one to subscribing
 * (a single client cannot do both simultaneously in Redis's pub/sub model).
 *
 * This is what enables horizontal scaling: when running multiple Node.js
 * instances behind a load balancer, a `message:new` (or any other) event
 * emitted on Instance A's Socket.io server is published to Redis and
 * relayed to every OTHER instance's connected sockets in the same room,
 * even though those sockets are connected to a different process entirely.
 */
export async function createRedisAdapterClients(): Promise<{
  pubClient: RedisClientType;
  subClient: RedisClientType;
}> {
  pubClient = createClient({ url: env.redisUrl });
  subClient = pubClient.duplicate();

  pubClient.on('error', (err: Error) => logger.error(`Redis pub client error: ${err.message}`));
  subClient.on('error', (err: Error) => logger.error(`Redis sub client error: ${err.message}`));

  await Promise.all([pubClient.connect(), subClient.connect()]);

  logger.info(`Redis adapter clients connected: ${env.redisUrl}`);

  return { pubClient, subClient };
}

/**
 * Gracefully closes both Redis connections. Called during server shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  await Promise.all([pubClient?.quit(), subClient?.quit()]);
}
