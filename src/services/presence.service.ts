import User, { IUser } from '../models/User.model';
import Conversation from '../models/Conversation.model';

/**
 * In-memory reference count of active Socket.io connections per user.
 * Supports multiple simultaneous devices/tabs per user: the DB `status`
 * field only flips to `offline` once the LAST active connection closes,
 * and only flips to `online` on the FIRST connection (so opening a 2nd
 * tab doesn't re-trigger an `online` broadcast, and closing one of two
 * tabs doesn't incorrectly mark the user offline).
 *
 * NOTE: This is process-local state. In a multi-instance deployment
 * (Phase 7, Redis adapter), this would need to move to a shared store
 * (e.g. Redis) so connection counts are correct across instances.
 */
const activeConnections = new Map<string, Set<string>>();

/**
 * Registers a new active connection for a user.
 * Returns `true` if this is the user's first active connection
 * (i.e. they were previously fully offline).
 */
export function addConnection(userId: string, socketId: string): boolean {
  const sockets = activeConnections.get(userId);
  const isFirstConnection = !sockets || sockets.size === 0;

  if (sockets) {
    sockets.add(socketId);
  } else {
    activeConnections.set(userId, new Set([socketId]));
  }

  return isFirstConnection;
}

/**
 * Removes an active connection for a user.
 * Returns `true` if this was the user's last active connection
 * (i.e. they are now fully offline).
 */
export function removeConnection(userId: string, socketId: string): boolean {
  const sockets = activeConnections.get(userId);
  if (!sockets) return true;

  sockets.delete(socketId);

  const isLastConnection = sockets.size === 0;
  if (isLastConnection) {
    activeConnections.delete(userId);
  }

  return isLastConnection;
}

/**
 * Returns whether a user currently has at least one active connection.
 * Exposed for potential REST use (e.g. an initial presence snapshot).
 */
export function isUserOnline(userId: string): boolean {
  const sockets = activeConnections.get(userId);
  return !!sockets && sockets.size > 0;
}

/**
 * Persists a user's status as `online` in MongoDB.
 */
export async function setUserOnline(userId: string): Promise<IUser | null> {
  return User.findByIdAndUpdate(userId, { status: 'online' }, { new: true });
}

/**
 * Persists a user's status as `offline` and stamps `lastSeen` to now.
 */
export async function setUserOffline(userId: string): Promise<IUser | null> {
  return User.findByIdAndUpdate(userId, { status: 'offline', lastSeen: new Date() }, { new: true });
}

/**
 * Returns the IDs of every conversation the user is a member of.
 * Used to determine which Socket.io rooms to broadcast presence
 * changes to (only members of a shared conversation care that a
 * given user went online/offline).
 */
export async function getUserConversationRoomIds(userId: string): Promise<string[]> {
  const conversations = await Conversation.find({ members: userId }).select('_id');
  return conversations.map((c) => c._id.toString());
}
