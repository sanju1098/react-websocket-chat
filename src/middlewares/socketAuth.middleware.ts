import { Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';

type SocketMiddlewareNext = (err?: Error) => void;

/**
 * Authenticates incoming Socket.io connections via a JWT passed in the
 * handshake (`socket.handshake.auth.token`). Rejects the connection with
 * an error (surfaced to the client's `connect_error` event) if missing/invalid.
 *
 * On success, attaches the decoded payload to `socket.data.user` for use
 * by all downstream event handlers.
 */
export function socketAuthMiddleware(socket: Socket, next: SocketMiddlewareNext): void {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers.authorization?.startsWith('Bearer ')
      ? socket.handshake.headers.authorization.split(' ')[1]
      : undefined);

  if (!token) {
    next(new Error('Authentication required: missing token in handshake'));
    return;
  }

  try {
    const payload = verifyToken(token);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('Authentication failed: invalid or expired token'));
  }
}
