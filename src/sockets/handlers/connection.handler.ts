import { Socket } from 'socket.io';
import { isConversationMember } from '../../services/conversation.service';
import logger from '../../utils/logger';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAck,
} from '../../types/socket';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Registers `conversation:join` / `conversation:leave` handlers on a socket.
 * Rooms are named by conversation ID so `io.to(conversationId).emit(...)`
 * reaches every member's active connections (Phase 3+).
 */
export function registerConnectionHandlers(socket: AppSocket): void {
  const { userId } = socket.data.user;

  socket.on('conversation:join', async (conversationId: string, ack?: (res: SocketAck) => void) => {
    try {
      if (!(await isConversationMember(conversationId, userId))) {
        ack?.({ success: false, message: 'Not a member of this conversation' });
        return;
      }

      await socket.join(conversationId);
      logger.info(`Socket ${socket.id} (user ${userId}) joined room ${conversationId}`);
      ack?.({ success: true });
    } catch (error) {
      const err = error as Error;
      logger.error(`conversation:join error: ${err.message}`);
      ack?.({ success: false, message: 'Failed to join conversation' });
    }
  });

  socket.on('conversation:leave', async (conversationId: string, ack?: (res: SocketAck) => void) => {
    try {
      await socket.leave(conversationId);
      logger.info(`Socket ${socket.id} (user ${userId}) left room ${conversationId}`);
      ack?.({ success: true });
    } catch (error) {
      const err = error as Error;
      logger.error(`conversation:leave error: ${err.message}`);
      ack?.({ success: false, message: 'Failed to leave conversation' });
    }
  });
}
