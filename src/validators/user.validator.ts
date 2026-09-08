import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  search: z.string().trim().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
