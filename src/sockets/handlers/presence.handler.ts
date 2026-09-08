import { Socket } from 'socket.io';
import {
  addConnection,
  removeConnection,
  setUserOnline,
  setUserOffline,
  getUserConversationRoomIds,
} from '../../services/presence.service';
import logger from '../../utils/logger';
import { ClientToServerEvents, ServerToClientEvents, PresenceEvent } from '../../types/socket';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Joins this socket to every conversation room the user is currently a
 * member of. Runs on EVERY connection (every device/tab), not just the
 * first, so each socket can receive room-broadcast events (messages,
 * typing, receipts, presence) without requiring a manual `conversation:join`
 * call per conversation first.
 *
 * NOTE: Conversations created *after* this connection was established are
 * not auto-joined until the next reconnect (no live "joined a new
 * conversation" push yet — a reasonable Phase 6+ enhancement).
 */
export async function autoJoinConversationRooms(socket: AppSocket): Promise<void> {
  const { userId } = socket.data.user;
  const roomIds = await getUserConversationRoomIds(userId);
  if (roomIds.length > 0) {
    await socket.join(roomIds);
  }
}

/**
 * Called on every new socket connection (after handshake auth succeeds).
 * Tracks the connection and, if this is the user's FIRST active connection
 * (no other open tabs/devices), marks them `online` in MongoDB and
 * broadcasts `user:online` to every conversation room they belong to.
 */
export async function handleUserConnect(socket: AppSocket): Promise<void> {
  const { userId, username } = socket.data.user;
  const isFirstConnection = addConnection(userId, socket.id);

  if (!isFirstConnection) {
    // User already has another active tab/device — no status change needed.
    return;
  }

  const user = await setUserOnline(userId);
  const roomIds = await getUserConversationRoomIds(userId);

  const payload: PresenceEvent = {
    userId,
    username,
    status: 'online',
    lastSeen: (user?.lastSeen ?? new Date()).toISOString(),
  };

  roomIds.forEach((roomId) => socket.nsp.to(roomId).emit('user:online', payload));

  logger.info(
    `User ${username} (${userId}) is now online — broadcast to ${roomIds.length} conversation(s)`
  );
}

/**
 * Called on socket disconnect. Tracks the disconnection and, if this was
 * the user's LAST active connection (no other open tabs/devices remain),
 * marks them `offline` + stamps `lastSeen`, then broadcasts `user:offline`
 * to every conversation room they belong to.
 */
export async function handleUserDisconnect(socket: AppSocket): Promise<void> {
  const { userId, username } = socket.data.user;
  const isLastConnection = removeConnection(userId, socket.id);

  if (!isLastConnection) {
    // User still has other active tabs/devices — remain online.
    return;
  }

  const user = await setUserOffline(userId);
  const roomIds = await getUserConversationRoomIds(userId);

  const payload: PresenceEvent = {
    userId,
    username,
    status: 'offline',
    lastSeen: (user?.lastSeen ?? new Date()).toISOString(),
  };

  roomIds.forEach((roomId) => socket.nsp.to(roomId).emit('user:offline', payload));

  logger.info(
    `User ${username} (${userId}) is now offline — broadcast to ${roomIds.length} conversation(s)`
  );
}
