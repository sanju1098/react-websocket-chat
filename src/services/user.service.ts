import User, { IUser } from '../models/User.model';

/**
 * Lists users for the "start a new chat" picker: excludes the calling user,
 * optionally filters by a case-insensitive partial match on `username`
 * (falls back to the most recently active users when no search term is given).
 */
export async function listUsers(
  currentUserId: string,
  search: string | undefined,
  limit: number
): Promise<IUser[]> {
  const filter: Record<string, unknown> = { _id: { $ne: currentUserId } };

  if (search) {
    filter.username = { $regex: search, $options: 'i' };
  }

  return User.find(filter)
    .sort({ username: 1 })
    .limit(limit)
    .select('username email status lastSeen');
}
