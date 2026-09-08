// Main chat screen: conversation sidebar + active chat window + composer.
import { useMemo, useState } from 'react';
import ChatWindow from '../components/ChatWindow';
import ConversationList from '../components/ConversationList';
import MessageInput from '../components/MessageInput';
import NewConversationModal from '../components/NewConversationModal';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { useMessages } from '../hooks/useMessages';
import './ChatPage.css';

export default function ChatPage() {
  const { user, token, logout } = useAuth();
  const { conversations, startConversation } = useConversations(token);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const { messages, loading, typingUsers, sendMessage, markRead, notifyTyping } =
    useMessages(token, activeConversationId);

  const activeConversation = useMemo(
    () => conversations.find((c) => c._id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const title = useMemo(() => {
    if (!activeConversation || !user) return 'Select a conversation';
    if (activeConversation.type === 'group') {
      return activeConversation.name || 'Group chat';
    }
    const other = activeConversation.members.find((m) => m._id !== user._id);
    return other?.username || 'Unknown user';
  }, [activeConversation, user]);

  const subtitle = useMemo(() => {
    if (!activeConversation || !user) return '';
    if (activeConversation.type === 'group') {
      return `${activeConversation.members.length} members`;
    }
    const other = activeConversation.members.find((m) => m._id !== user._id);
    return other?.status === 'online' ? 'Online' : 'Offline';
  }, [activeConversation, user]);

  if (!user) return null;

  return (
    <div className="chat-page">
      <div className="chat-page-topbar">
        <span>
          Signed in as <strong>{user.username}</strong>
        </span>
        <button type="button" onClick={logout}>
          Log out
        </button>
      </div>

      <div className="chat-page-body">
        <ConversationList
          conversations={conversations}
          currentUserId={user._id}
          activeConversationId={activeConversationId}
          onSelect={setActiveConversationId}
          onNewConversation={() => setShowNewChat(true)}
        />

        {activeConversationId ? (
          <div className="chat-page-active">
            <ChatWindow
              messages={messages}
              currentUserId={user._id}
              typingUsers={typingUsers}
              loading={loading}
              title={title}
              subtitle={subtitle}
              onVisibleLastMessage={markRead}
            />
            <MessageInput onSend={sendMessage} onTyping={notifyTyping} />
          </div>
        ) : (
          <div className="chat-page-placeholder">
            <p>Select a conversation or start a new one</p>
          </div>
        )}
      </div>

      {showNewChat && token && (
        <NewConversationModal
          token={token}
          onClose={() => setShowNewChat(false)}
          onCreate={async (memberId) => {
            const conversation = await startConversation('1:1', [memberId]);
            setActiveConversationId(conversation._id);
          }}
        />
      )}
    </div>
  );
}
