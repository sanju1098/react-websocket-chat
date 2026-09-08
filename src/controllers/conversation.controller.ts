import { Request, Response, NextFunction } from 'express';
import * as conversationService from '../services/conversation.service';
import { AppError } from '../middlewares/errorHandler.middleware';

export async function createConversationHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);
    const conversation = await conversationService.createConversation(req.user.userId, req.body);
    res.status(201).json({ success: true, data: { conversation } });
  } catch (error) {
    next(error);
  }
}

export async function listConversationsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);
    const results = await conversationService.listConversations(req.user.userId);

    // Flatten { conversation, unreadCount } into a single object per item so
    // clients get `unreadCount` alongside the conversation's own fields
    // without needing to unwrap a nested structure.
    const conversations = results.map(({ conversation, unreadCount }) => ({
      ...conversation.toJSON(),
      unreadCount,
    }));

    res.status(200).json({ success: true, data: { conversations } });
  } catch (error) {
    next(error);
  }
}

export async function getMessageHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);
    const { id } = req.params;
    const { limit, before } = req.query as unknown as { limit: number; before?: string };

    await conversationService.assertMembership(id, req.user.userId);
    const result = await conversationService.getMessageHistory(id, limit, before);

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
