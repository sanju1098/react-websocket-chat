import { Types } from 'mongoose';
import Conversation, { IConversation } from '../models/Conversation.model';
import Message from '../models/Message.model';
import { AppError } from '../middlewares/errorHandler.middleware';
import { CreateConversationInput } from '../validators/conversation.validator';

/**
 * Creates a new 1:1 or group conversation. For 1:1, reuses an existing
 * conversation between the two members if one already exists (idempotent).
 */
export async function createConversation(
  currentUserId: string,
  input: CreateConversationInput
): Promise<IConversation> {
  const memberIds = Array.from(new Set([currentUserId, ...input.members]));

  if (input.type === '1:1') {
    const existing = await Conversation.findOne({
      type: '1:1',
      members: { $all: memberIds, $size: memberIds.length },
    });
    if (existing) return existing;
  }

  const conversation = await Conversation.create({
    type: input.type,
    name: input.name,
    members: memberIds,
  });

  return conversation;
}

export interface ConversationWithUnreadCount {
  conversation: IConversation;
  unreadCount: number;
}

/**
 * Lists all conversations the given user is a member of, sorted by
 * most recently active, with the last message populated for preview and
 * an `unreadCount` computed per conversation (messages from OTHER members
 * not yet marked `read` by the caller — mirrors the exclusion logic used
 * by the `message:read` Socket.io handler, see message.service.ts).
 */
export async function listConversations(userId: string): Promise<ConversationWithUnreadCount[]> {
  const conversations = await Conversation.find({ members: userId })
    .sort({ updatedAt: -1 })
    .populate('lastMessage')
    .populate('members', 'username email status lastSeen');

  if (conversations.length === 0) return [];

  const unreadCounts = await Message.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        conversationId: { $in: conversations.map((c) => c._id) },
        senderId: { $ne: new Types.ObjectId(userId) },
        status: { $ne: 'read' },
      },
    },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);

  const countsByConversationId = new Map(unreadCounts.map((c) => [c._id.toString(), c.count]));

  return conversations.map((conversation) => ({
    conversation,
    unreadCount: countsByConversationId.get(conversation._id.toString()) ?? 0,
  }));
}

/**
 * Verifies the given user is a member of the conversation.
 * Throws 404 to avoid leaking existence of conversations the user can't access.
 */
export async function assertMembership(
  conversationId: string,
  userId: string
): Promise<IConversation> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new AppError('Invalid conversation ID', 400);
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    members: userId,
  });

  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  return conversation;
}

/**
 * Boolean membership check (no throw). Used by Socket.io handlers
 * (conversation:join, typing:start/stop) that respond via ack callbacks
 * rather than the centralized REST error handler.
 */
export async function isConversationMember(
  conversationId: string,
  userId: string
): Promise<boolean> {
  if (!Types.ObjectId.isValid(conversationId)) return false;
  const conversation = await Conversation.findOne({ _id: conversationId, members: userId });
  return !!conversation;
}

interface PaginatedMessages {
  messages: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Fetches paginated message history for a conversation, newest-first,
 * using a `createdAt`-based cursor (`before`) for infinite scroll.
 */
export async function getMessageHistory(
  conversationId: string,
  limit: number,
  before?: string
): Promise<PaginatedMessages> {
  const query: Record<string, unknown> = { conversationId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate('senderId', 'username email');

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  return { messages: page, hasMore, nextCursor };
}
