import { Router } from 'express';
import { signupHandler, loginHandler, meHandler } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authRateLimiter } from '../middlewares/rateLimiter.middleware';
import { signupSchema, loginSchema } from '../validators/auth.validator';

const router = Router();

router.post('/signup', authRateLimiter, validate(signupSchema), signupHandler);
router.post('/login', authRateLimiter, validate(loginSchema), loginHandler);
router.get('/me', authMiddleware, meHandler);

export default router;
