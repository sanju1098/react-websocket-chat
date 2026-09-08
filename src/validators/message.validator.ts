import { z } from 'zod';
import { Types } from 'mongoose';
import { stripHtmlTags } from '../utils/sanitize';

const objectId = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

/**
 * Plain-text message content: trimmed, HTML tags stripped (defense-in-depth
 * XSS mitigation — see src/utils/sanitize.ts), then re-validated for length
 * AFTER sanitization so a message consisting only of tags (e.g. `<script>`)
 * is correctly rejected as empty rather than silently becoming an empty string.
 */
const messageText = z
  .string()
  .trim()
  .max(5000, 'Message text cannot exceed 5000 characters')
  .transform(stripHtmlTags)
  .refine((val) => val.length >= 1, { message: 'Message text cannot be empty' });

/**
 * Validates the payload for the `message:send` Socket.io event.
 */
export const sendMessageSchema = z.object({
  conversationId: objectId,
  text: messageText,
});

/**
 * Validates the payload for the `message:delivered` Socket.io event.
 */
export const messageDeliveredSchema = z.object({
  messageId: objectId,
});

/**
 * Validates the payload for the `message:read` Socket.io event.
 * `upToMessageId` marks all unread messages up to and including this one as read.
 */
export const messageReadSchema = z.object({
  conversationId: objectId,
  upToMessageId: objectId,
});

/**
 * Validates the payload for `typing:start` / `typing:stop` Socket.io events.
 */
export const typingSchema = z.object({
  conversationId: objectId,
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MessageDeliveredInput = z.infer<typeof messageDeliveredSchema>;
export type MessageReadInput = z.infer<typeof messageReadSchema>;
export type TypingInput = z.infer<typeof typingSchema>;
