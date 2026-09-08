import { Socket } from 'socket.io';
import { typingSchema } from '../../validators/message.validator';
import { isConversationMember } from '../../services/conversation.service';
import logger from '../../utils/logger';
import { ClientToServerEvents, ServerToClientEvents, TypingPayload } from '../../types/socket';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Registers `typing:start` / `typing:stop` handlers on a socket.
 * These are fire-and-forget (no ack, no persistence) — purely ephemeral UI
 * signals broadcast to the OTHER members of the room (excluding the sender,
 * via `socket.to()` instead of `socket.nsp.to()`), so a user never sees
 * their own typing indicator echoed back.
 */
export function registerTypingHandlers(socket: AppSocket): void {
  const { userId, username } = socket.data.user;

  async function broadcastTyping(event: 'typing:start' | 'typing:stop', payload: TypingPayload): Promise<void> {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn(`${event} error: invalid payload from user ${userId}`);
      return;
    }

    const { conversationId } = parsed.data;
    if (!(await isConversationMember(conversationId, userId))) {
      logger.warn(`${event} rejected: user ${userId} is not a member of ${conversationId}`);
      return;
    }

    socket.to(conversationId).emit(event, { conversationId, userId, username });
  }

  socket.on('typing:start', (payload: TypingPayload) => {
    void broadcastTyping('typing:start', payload);
  });

  socket.on('typing:stop', (payload: TypingPayload) => {
    void broadcastTyping('typing:stop', payload);
  });
}
