import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service';
import { AppError } from '../middlewares/errorHandler.middleware';
import { ListUsersQuery } from '../validators/user.validator';

export async function listUsersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);
    const { search, limit } = req.query as unknown as ListUsersQuery;
    const users = await userService.listUsers(req.user.userId, search, limit);
    res.status(200).json({ success: true, data: { users } });
  } catch (error) {
    next(error);
  }
}
