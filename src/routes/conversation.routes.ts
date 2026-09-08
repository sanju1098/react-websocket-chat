import { Router } from 'express';
import {
  createConversationHandler,
  listConversationsHandler,
  getMessageHistoryHandler,
} from '../controllers/conversation.controller';
import { validate } from '../middlewares/validate.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  createConversationSchema,
  paginationQuerySchema,
} from '../validators/conversation.validator';

const router = Router();

router.use(authMiddleware);

router.get('/', listConversationsHandler);
router.post('/', validate(createConversationSchema), createConversationHandler);
router.get('/:id/messages', validate(paginationQuerySchema, 'query'), getMessageHistoryHandler);

export default router;
