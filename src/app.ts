import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import env from './config/env';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.middleware';
import logger from './utils/logger';
import authRoutes from './routes/auth.routes';
import conversationRoutes from './routes/conversation.routes';
import userRoutes from './routes/user.routes';

const app: Application = express();

// Security & parsing middlewares
app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logging
if (env.nodeEnv !== 'test') {
  app.use(
    morgan('dev', {
      stream: { write: (message: string) => logger.info(message.trim()) },
    })
  );
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/users', userRoutes);

// notFoundHandler and errorHandler must be registered last, after all routes
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
