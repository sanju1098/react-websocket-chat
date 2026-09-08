import { Types } from 'mongoose';
import Message, { IMessage } from '../models/Message.model';
import Conversation from '../models/Conversation.model';
import { AppError } from '../middlewares/errorHandler.middleware';
import { SendMessageInput } from '../validators/message.validator';
import { isConversationMember } from './conversation.service';

/**
 * Verifies the sender is a member of the conversation, persists the new
 * message, and updates the conversation's `lastMessage` pointer + `updatedAt`
 * (so conversation lists sort by most recent activity). Used by the
 * `message:send` Socket.io handler.
 *
 * Throws 404 if the conversation doesn't exist or the sender isn't a member
 * (same error for both, to avoid leaking conversation existence).
 */
export async function createMessage(
  senderId: string,
  input: SendMessageInput
): Promise<IMessage> {
  const conversation = await Conversation.findOne({
    _id: input.conversationId,
    members: senderId,
  });

  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  const message = await Message.create({
    conversationId: input.conversationId,
    senderId,
    text: input.text,
    status: 'sent',
  });

  conversation.lastMessage = message._id as Types.ObjectId;
  await conversation.save();

  await message.populate('senderId', 'username email');

  return message;
}

interface StatusUpdateResult {
  message: IMessage;
  conversationId: string;
}

/**
 * Marks a single message as `delivered` (recipient's client received it).
 * Only advances the status forward (`sent` -> `delivered`); does not
 * downgrade an already-`read` message back to `delivered`.
 *
 * Throws 404 if the message doesn't exist or the caller isn't a member of
 * its conversation (same error for both, to avoid leaking existence).
 */
export async function markMessageDelivered(
  messageId: string,
  userId: string
): Promise<StatusUpdateResult> {
  if (!Types.ObjectId.isValid(messageId)) {
    throw new AppError('Invalid message ID', 400);
  }

  const message = await Message.findById(messageId);
  if (!message || !(await isConversationMember(message.conversationId.toString(), userId))) {
    throw new AppError('Message not found', 404);
  }

  if (message.status === 'sent') {
    message.status = 'delivered';
    await message.save();
  }

  return { message, conversationId: message.conversationId.toString() };
}

/**
 * Marks all messages in a conversation up to (and including) the given
 * message as `read` by the calling user. Only updates messages not sent
 * by the caller (a user's own messages aren't "read" by themselves) and
 * not already `read`, keeping the operation idempotent and cheap to repeat.
 *
 * Throws 404 if the conversation/message doesn't exist or the caller isn't
 * a member.
 */
export async function markMessagesRead(
  conversationId: string,
  upToMessageId: string,
  userId: string
): Promise<{ conversationId: string; messageIds: string[] }> {
  if (!Types.ObjectId.isValid(conversationId) || !Types.ObjectId.isValid(upToMessageId)) {
    throw new AppError('Invalid ID', 400);
  }

  if (!(await isConversationMember(conversationId, userId))) {
    throw new AppError('Conversation not found', 404);
  }

  const upToMessage = await Message.findOne({ _id: upToMessageId, conversationId });
  if (!upToMessage) {
    throw new AppError('Message not found', 404);
  }

  const messagesToUpdate = await Message.find({
    conversationId,
    senderId: { $ne: userId },
    status: { $ne: 'read' },
    createdAt: { $lte: upToMessage.createdAt },
  }).select('_id');

  const messageIds = messagesToUpdate.map((m) => m._id.toString());

  if (messageIds.length > 0) {
    await Message.updateMany({ _id: { $in: messageIds } }, { $set: { status: 'read' } });
  }

  return { conversationId, messageIds };
}
