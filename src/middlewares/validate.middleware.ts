import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { AppError } from './errorHandler.middleware';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Generic Zod validation middleware factory.
 * Validates the given request part against the schema and replaces it
 * with the parsed (and type-coerced) result on success.
 */
export function validate(schema: ZodTypeAny, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[part]);
      (req as Request)[part] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        next(new AppError(`Validation error: ${message}`, 400));
        return;
      }
      next(error);
    }
  };
}
