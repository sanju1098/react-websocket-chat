import { z } from 'zod';
import { Types } from 'mongoose';

const objectId = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

export const createConversationSchema = z
  .object({
    type: z.enum(['1:1', 'group']),
    name: z.string().trim().min(1).max(100).optional(),
    members: z.array(objectId).min(1),
  })
  .refine((data) => data.type === 'group' || data.members.length === 1, {
    message: '1:1 conversations must have exactly one other member',
    path: ['members'],
  })
  .refine((data) => data.type !== 'group' || !!data.name, {
    message: 'Group conversations require a name',
    path: ['name'],
  });

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.string().datetime().optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
