// Shared TypeScript types for the Real-Time Chat frontend.
// Mirrors the data models documented in APIDoc.md.

export type UserStatus = 'online' | 'offline';

export interface User {
  _id: string;
  username: string;
  email: string;
  status: UserStatus;
  lastSeen: string;
}

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface Message {
  _id: string;
  conversationId: string;
  senderId: User | string;
  text: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
}

export type ConversationType = '1:1' | 'group';

export interface Conversation {
  _id: string;
  type: ConversationType;
  name?: string;
  members: User[];
  lastMessage?: Message | null;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface MessagesPage {
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  username: string;
}

export interface PresencePayload {
  userId: string;
  username: string;
  status: UserStatus;
  lastSeen: string;
}

export interface MessageDeliveredPayload {
  messageId: string;
  conversationId: string;
  deliveredBy: string;
}

export interface MessageReadPayload {
  conversationId: string;
  messageIds: string[];
  readBy: string;
}
