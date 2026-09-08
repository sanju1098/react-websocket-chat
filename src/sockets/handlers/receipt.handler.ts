import { Socket } from 'socket.io';
import { ZodError } from 'zod';
import { markMessageDelivered, markMessagesRead } from '../../services/message.service';
import { messageDeliveredSchema, messageReadSchema } from '../../validators/message.validator';
import { AppError } from '../../middlewares/errorHandler.middleware';
import logger from '../../utils/logger';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  MessageDeliveredPayload,
  MessageReadPayload,
  SocketAck,
} from '../../types/socket';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function ackError(ack: ((res: SocketAck) => void) | undefined, message: string): void {
  ack?.({ success: false, message });
}

/**
 * Registers `message:delivered` / `message:read` handlers on a socket.
 * Both broadcast a status-update event to the conversation room so every
 * member's UI (including the original sender) can reflect the new status
 * without polling REST.
 */
export function registerReceiptHandlers(socket: AppSocket): void {
  const { userId } = socket.data.user;

  socket.on('message:delivered', async (payload: MessageDeliveredPayload, ack?: (res: SocketAck) => void) => {
    try {
      const input = messageDeliveredSchema.parse(payload);
      const { message, conversationId } = await markMessageDelivered(input.messageId, userId);

      socket.nsp.to(conversationId).emit('message:delivered', {
        messageId: message._id.toString(),
        conversationId,
        deliveredBy: userId,
      });

      logger.info(`Message ${input.messageId} marked delivered by user ${userId}`);
      ack?.({ success: true });
    } catch (error) {
      if (error instanceof ZodError) {
        ackError(ack, `Validation error: ${error.errors.map((e) => e.message).join('; ')}`);
        return;
      }
      if (error instanceof AppError) {
        ackError(ack, error.message);
        return;
      }
      const err = error as Error;
      logger.error(`message:delivered error: ${err.message}`);
      ackError(ack, 'Failed to mark message delivered');
    }
  });

  socket.on('message:read', async (payload: MessageReadPayload, ack?: (res: SocketAck) => void) => {
    try {
      const input = messageReadSchema.parse(payload);
      const { conversationId, messageIds } = await markMessagesRead(
        input.conversationId,
        input.upToMessageId,
        userId
      );

      if (messageIds.length > 0) {
        socket.nsp.to(conversationId).emit('message:read', {
          conversationId,
          messageIds,
          readBy: userId,
        });
      }

      logger.info(
        `${messageIds.length} message(s) marked read by user ${userId} in conversation ${conversationId}`
      );
      ack?.({ success: true });
    } catch (error) {
      if (error instanceof ZodError) {
        ackError(ack, `Validation error: ${error.errors.map((e) => e.message).join('; ')}`);
        return;
      }
      if (error instanceof AppError) {
        ackError(ack, error.message);
        return;
      }
      const err = error as Error;
      logger.error(`message:read error: ${err.message}`);
      ackError(ack, 'Failed to mark messages read');
    }
  });
}
