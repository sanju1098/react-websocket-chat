import http from 'http';
import app from './app';
import { connectDB, disconnectDB } from './config/db';
import { disconnectRedis } from './config/redis';
import env from './config/env';
import logger from './utils/logger';
import { initSocketServer } from './sockets';

const server = http.createServer(app);

async function startServer(): Promise<void> {
  await connectDB();

  await initSocketServer(server);

  server.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
    logger.info('Socket.io server initialized and attached');
  });
}

startServer();

async function shutdown(signal: string, exitCode: number): Promise<void> {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    try {
      if (env.redisEnabled) await disconnectRedis();
      await disconnectDB();
    } catch (error) {
      const err = error as Error;
      logger.error(`Error during shutdown cleanup: ${err.message}`);
    } finally {
      process.exit(exitCode);
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT', 0));
process.on('SIGTERM', () => void shutdown('SIGTERM', 0));

process.on('unhandledRejection', (err: Error) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  void shutdown('unhandledRejection', 1);
});

export default server;
