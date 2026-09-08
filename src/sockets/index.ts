import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import env from '../config/env';
import logger from '../utils/logger';
import { createRedisAdapterClients } from '../config/redis';
import { socketAuthMiddleware } from '../middlewares/socketAuth.middleware';
import { socketRateLimitMiddleware } from '../middlewares/socketRateLimit.middleware';
import { registerConnectionHandlers } from './handlers/connection.handler';
import { registerMessageHandlers } from './handlers/message.handler';
import { registerReceiptHandlers } from './handlers/receipt.handler';
import { registerTypingHandlers } from './handlers/typing.handler';
import {
  autoJoinConversationRooms,
  handleUserConnect,
  handleUserDisconnect,
} from './handlers/presence.handler';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket';

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: AppServer | undefined;

/**
 * Initializes the Socket.io server, optionally attaches the Redis adapter
 * (for multi-instance horizontal scaling — see src/config/redis.ts), and
 * wires up handshake auth + per-connection event handlers. Call once from
 * server.ts. Async because Redis client connection is awaited when enabled.
 */
export async function initSocketServer(httpServer: HttpServer): Promise<AppServer> {
  io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      credentials: true,
    },
  });

  if (env.redisEnabled) {
    const { pubClient, subClient } = await createRedisAdapterClients();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io Redis adapter attached — ready for multi-instance scaling');
  } else {
    logger.info('Socket.io running with default in-memory adapter (single instance mode)');
  }

  io.use(socketAuthMiddleware);
  io.use(socketRateLimitMiddleware);

  io.on(
    'connection',
    (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
      const { userId, username } = socket.data.user;
      logger.info(`Socket connected: ${socket.id} (user: ${username}, userId: ${userId})`);

      registerConnectionHandlers(socket);
      registerMessageHandlers(socket);
      registerReceiptHandlers(socket);
      registerTypingHandlers(socket);

      void (async () => {
        try {
          await autoJoinConversationRooms(socket);
          await handleUserConnect(socket);
        } catch (error) {
          const err = error as Error;
          logger.error(`Presence connect error for socket ${socket.id}: ${err.message}`);
        }
      })();

      socket.on('disconnect', (reason: string) => {
        logger.info(`Socket disconnected: ${socket.id} (user: ${username}) - reason: ${reason}`);
        handleUserDisconnect(socket).catch((error: Error) => {
          logger.error(`Presence disconnect error for socket ${socket.id}: ${error.message}`);
        });
      });
    }
  );

  return io;
}

/**
 * Returns the initialized Socket.io server instance.
 * Throws if called before `initSocketServer`. Used by REST-side code (Phase 4+)
 * that needs to emit events, e.g. from a controller after persisting data.
 */
export function getSocketServer(): AppServer {
  if (!io) {
    throw new Error('Socket.io server has not been initialized yet');
  }
  return io;
}
