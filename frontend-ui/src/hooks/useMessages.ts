// Manages message history + real-time events (new/delivered/read/typing)
// for a single active conversation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessages } from '../lib/api';
import { getSocket } from '../lib/socket';
import type {
  Message,
  MessageDeliveredPayload,
  MessageReadPayload,
  TypingPayload,
} from '../types';

const TYPING_STOP_DELAY_MS = 2500;

export function useMessages(token: string | null, conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset thread state when switching conversations, then (re)synchronize
    // with the server (fetch history + join socket room) below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setTypingUsers({});
    if (!token || !conversationId) return;

    const socket = getSocket();
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const page = await getMessages(token!, conversationId!, { limit: 50 });
        if (!cancelled) {
          setMessages([...page.messages].reverse());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load messages');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    socket?.emit('conversation:join', conversationId);

    function onNewMessage(message: Message) {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => [...prev, message]);
    }

    function onDelivered(payload: MessageDeliveredPayload) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === payload.messageId && m.status === 'sent'
            ? { ...m, status: 'delivered' }
            : m,
        ),
      );
    }

    function onRead(payload: MessageReadPayload) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          payload.messageIds.includes(m._id) ? { ...m, status: 'read' } : m,
        ),
      );
    }

    function onTypingStart(payload: TypingPayload) {
      if (payload.conversationId !== conversationId) return;
      setTypingUsers((prev) => ({ ...prev, [payload.userId]: payload.username }));
    }

    function onTypingStop(payload: TypingPayload) {
      if (payload.conversationId !== conversationId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[payload.userId];
        return next;
      });
    }

    socket?.on('message:new', onNewMessage);
    socket?.on('message:delivered', onDelivered);
    socket?.on('message:read', onRead);
    socket?.on('typing:start', onTypingStart);
    socket?.on('typing:stop', onTypingStop);

    return () => {
      cancelled = true;
      socket?.emit('conversation:leave', conversationId);
      socket?.off('message:new', onNewMessage);
      socket?.off('message:delivered', onDelivered);
      socket?.off('message:read', onRead);
      socket?.off('typing:start', onTypingStart);
      socket?.off('typing:stop', onTypingStop);
    };
  }, [token, conversationId]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!conversationId || !text.trim()) return;
      const socket = getSocket();
      socket?.emit(
        'message:send',
        { conversationId, text: text.trim() },
        (ack: { success: boolean; message?: string }) => {
          if (!ack.success) {
            setError(ack.message || 'Failed to send message');
          }
        },
      );
    },
    [conversationId],
  );

  const markRead = useCallback(
    (upToMessageId: string) => {
      if (!conversationId) return;
      getSocket()?.emit('message:read', { conversationId, upToMessageId });
    },
    [conversationId],
  );

  const notifyTyping = useCallback(() => {
    if (!conversationId) return;
    const socket = getSocket();
    socket?.emit('typing:start', { conversationId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit('typing:stop', { conversationId });
    }, TYPING_STOP_DELAY_MS);
  }, [conversationId]);

  return { messages, loading, error, typingUsers, sendMessage, markRead, notifyTyping };
}
