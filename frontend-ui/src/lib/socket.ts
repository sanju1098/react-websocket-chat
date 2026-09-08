// Socket.io client wrapper for real-time chat events (see APIDoc.md).
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect();
  }
  socket = io(SOCKET_URL, {
    auth: { token },
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
