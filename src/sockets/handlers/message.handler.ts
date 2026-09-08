import { Socket } from 'socket.io';
import { ZodError } from 'zod';
import { createMessage } from '../../services/message.service';
import { sendMessageSchema } from '../../validators/message.validator';
import { AppError } from '../../middlewares/errorHandler.middleware';
import { checkMessageRateLimit } from '../../middlewares/socketRateLimit.middleware';
import { IMessage } from '../../models/Message.model';
import env from '../../config/env';
import logger from '../../utils/logger';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SendMessagePayload,
  MessageSendAck,
  SocketMessagePayload,
} from '../../types/socket';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Serializes a persisted Message document into the wire payload shape
 * broadcast to clients (avoids leaking Mongoose internals).
 */
function toSocketPayload(message: IMessage): SocketMessagePayload {
  const plain = message.toJSON() as unknown as SocketMessagePayload & { _id: string };
  return {
    _id: plain._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: plain.senderId,
    text: message.text,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}

/**
 * Registers the `message:send` handler on a socket:
 * validate payload -> persist via message.service -> broadcast `message:new`
 * to every socket in the conversation's room (including the sender's other
 * devices/tabs) -> acknowledge the sender with the persisted message.
 */
export function registerMessageHandlers(socket: AppSocket): void {
  const { userId } = socket.data.user;

  socket.on(
    'message:send',
    async (payload: SendMessagePayload, ack?: (res: MessageSendAck) => void) => {
      try {
        if (!checkMessageRateLimit(userId)) {
          logger.warn(`Rate limit exceeded for user ${userId} on message:send`);
          ack?.({
            success: false,
            message: `Rate limit exceeded: max ${env.socketRateLimitMax} messages per ${
              env.socketRateLimitWindowMs / 1000
            }s. Please slow down.`,
          });
          return;
        }

        const input = sendMessageSchema.parse(payload);
        const message = await createMessage(userId, input);
        const socketPayload = toSocketPayload(message);

        // Broadcast to all members currently in the room, including the sender's
        // other connections. Room name == conversationId (see connection.handler.ts).
        socket.nsp.to(input.conversationId).emit('message:new', socketPayload);

        logger.info(
          `Message sent by user ${userId} in conversation ${input.conversationId} (message ${socketPayload._id})`
        );

        ack?.({ success: true, data: socketPayload });
      } catch (error) {
        if (error instanceof ZodError) {
          const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
          ack?.({ success: false, message: `Validation error: ${message}` });
          return;
        }
        if (error instanceof AppError) {
          ack?.({ success: false, message: error.message });
          return;
        }
        const err = error as Error;
        logger.error(`message:send error: ${err.message}`);
        ack?.({ success: false, message: 'Failed to send message' });
      }
    }
  );
}
