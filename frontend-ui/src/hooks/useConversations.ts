// Fetches and manages the authenticated user's conversation list,
// and keeps it live-updated for new messages / presence changes.
import { useCallback, useEffect, useState } from 'react';
import { createConversation, listConversations } from '../lib/api';
import { getSocket } from '../lib/socket';
import type {
  Conversation,
  ConversationType,
  Message,
  PresencePayload,
} from '../types';

export function useConversations(token: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { conversations: list } = await listConversations(token);
      setConversations(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Data-fetching effect on mount/token change: refresh() sets loading
    // state before its first await, which is the standard pattern for
    // effect-based data fetching (see https://react.dev/learn/you-might-not-need-an-effect#fetching-data).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function bumpConversationWithMessage(message: Message) {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c._id === message.conversationId);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], lastMessage: message };
        const next = [...prev];
        next.splice(idx, 1);
        return [updated, ...next];
      });
    }

    function updatePresence(payload: PresencePayload) {
      setConversations((prev) =>
        prev.map((conv) => ({
          ...conv,
          members: conv.members.map((m) =>
            m._id === payload.userId
              ? { ...m, status: payload.status, lastSeen: payload.lastSeen }
              : m,
          ),
        })),
      );
    }

    socket.on('message:new', bumpConversationWithMessage);
    socket.on('user:online', updatePresence);
    socket.on('user:offline', updatePresence);

    return () => {
      socket.off('message:new', bumpConversationWithMessage);
      socket.off('user:online', updatePresence);
      socket.off('user:offline', updatePresence);
    };
  }, [token]);

  const startConversation = useCallback(
    async (type: ConversationType, members: string[], name?: string) => {
      if (!token) throw new Error('Not authenticated');
      const { conversation } = await createConversation(token, { type, members, name });
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === conversation._id);
        return exists ? prev : [conversation, ...prev];
      });
      return conversation;
    },
    [token],
  );

  return { conversations, loading, error, refresh, startConversation };
}
