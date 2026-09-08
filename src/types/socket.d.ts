import { JwtPayload } from '../utils/jwt';

/**
 * Shape of a message as broadcast to clients over Socket.io.
 * Mirrors the REST message history shape (see APIDoc.md) so clients can
 * use a single message-rendering code path regardless of source.
 */
export interface SocketMessagePayload {
  _id: string;
  conversationId: string;
  senderId: { _id: string; username: string; email: string } | string;
  text: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload sent by the client when emitting `message:send`.
 */
export interface SendMessagePayload {
  conversationId: string;
  text: string;
}

/**
 * Acknowledgement returned to the sender after `message:send` is processed.
 */
export interface MessageSendAck extends SocketAck {
  message?: string;
  data?: SocketMessagePayload;
}

/** Payload for `message:delivered` (client -> server). */
export interface MessageDeliveredPayload {
  messageId: string;
}

/** Payload for `message:read` (client -> server). */
export interface MessageReadPayload {
  conversationId: string;
  upToMessageId: string;
}

/** Payload for `typing:start` / `typing:stop` (client -> server). */
export interface TypingPayload {
  conversationId: string;
}

/** Broadcast to the sender when a recipient's client confirms delivery. */
export interface MessageDeliveredEvent {
  messageId: string;
  conversationId: string;
  deliveredBy: string;
}

/** Broadcast to the sender(s) when a recipient marks messages as read. */
export interface MessageReadEvent {
  conversationId: string;
  messageIds: string[];
  readBy: string;
}

/** Broadcast to other room members when a user starts/stops typing. */
export interface TypingEvent {
  conversationId: string;
  userId: string;
  username: string;
}

/** Broadcast to a user's conversation rooms when they come online/go offline. */
export interface PresenceEvent {
  userId: string;
  username: string;
  status: 'online' | 'offline';
  lastSeen: string;
}

/**
 * Events emitted BY the client and handled ON the server.
 */
export interface ClientToServerEvents {
  'conversation:join': (conversationId: string, ack?: (response: SocketAck) => void) => void;
  'conversation:leave': (conversationId: string, ack?: (response: SocketAck) => void) => void;
  'message:send': (payload: SendMessagePayload, ack?: (response: MessageSendAck) => void) => void;
  'message:delivered': (
    payload: MessageDeliveredPayload,
    ack?: (response: SocketAck) => void
  ) => void;
  'message:read': (payload: MessageReadPayload, ack?: (response: SocketAck) => void) => void;
  'typing:start': (payload: TypingPayload) => void;
  'typing:stop': (payload: TypingPayload) => void;
}

/**
 * Events emitted BY the server and handled ON the client.
 */
export interface ServerToClientEvents {
  error: (payload: { message: string }) => void;
  'message:new': (message: SocketMessagePayload) => void;
  'message:delivered': (payload: MessageDeliveredEvent) => void;
  'message:read': (payload: MessageReadEvent) => void;
  'typing:start': (payload: TypingEvent) => void;
  'typing:stop': (payload: TypingEvent) => void;
  'user:online': (payload: PresenceEvent) => void;
  'user:offline': (payload: PresenceEvent) => void;
}

/**
 * Events for server-to-server communication (e.g. Redis adapter). Unused until Phase 7.
 */
export interface InterServerEvents {
  ping: () => void;
}

/**
 * Custom data attached to each socket instance after successful handshake auth.
 */
export interface SocketData {
  user: JwtPayload;
}

/**
 * Generic acknowledgement payload for client-emitted events that expect a callback response.
 */
export interface SocketAck {
  success: boolean;
  message?: string;
}
