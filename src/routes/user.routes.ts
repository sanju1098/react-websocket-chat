import { Router } from 'express';
import { listUsersHandler } from '../controllers/user.controller';
import { validate } from '../middlewares/validate.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';
import { listUsersQuerySchema } from '../validators/user.validator';

const router = Router();

router.use(authMiddleware);

router.get('/', validate(listUsersQuerySchema, 'query'), listUsersHandler);

export default router;
