import bcrypt from 'bcrypt';
import User, { IUser, SALT_ROUNDS } from '../models/User.model';
import { signToken } from '../utils/jwt';
import { AppError } from '../middlewares/errorHandler.middleware';
import { SignupInput, LoginInput } from '../validators/auth.validator';

interface AuthResult {
  user: IUser;
  token: string;
}

/**
 * Registers a new user: checks uniqueness, hashes password, persists, issues JWT.
 */
export async function signup(input: SignupInput): Promise<AuthResult> {
  const existing = await User.findOne({
    $or: [{ email: input.email }, { username: input.username }],
  });

  if (existing) {
    const conflictField = existing.email === input.email ? 'email' : 'username';
    throw new AppError(`An account with this ${conflictField} already exists`, 409);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await User.create({
    username: input.username,
    email: input.email,
    passwordHash,
  });

  const token = signToken({
    userId: user._id.toString(),
    username: user.username,
    email: user.email,
  });

  return { user, token };
}

/**
 * Authenticates a user by email/password and issues a JWT on success.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email });

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = signToken({
    userId: user._id.toString(),
    username: user.username,
    email: user.email,
  });

  return { user, token };
}

/**
 * Fetches the current authenticated user's profile by ID.
 */
export async function getProfile(userId: string): Promise<IUser> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return user;
}
