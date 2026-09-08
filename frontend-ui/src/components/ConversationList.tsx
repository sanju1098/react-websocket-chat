// Sidebar list of the current user's conversations.
import type { Conversation, User } from '../types';
import './ConversationList.css';

interface Props {
  conversations: Conversation[];
  currentUserId: string;
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}

function getConversationLabel(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === 'group') {
    return conversation.name || 'Group chat';
  }
  const other = conversation.members.find((m) => m._id !== currentUserId);
  return other?.username || 'Unknown user';
}

function isOtherMemberOnline(conversation: Conversation, currentUserId: string): boolean {
  return conversation.members.some((m: User) => m._id !== currentUserId && m.status === 'online');
}

export default function ConversationList({
  conversations,
  currentUserId,
  activeConversationId,
  onSelect,
  onNewConversation,
}: Props) {
  return (
    <aside className="conversation-list">
      <div className="conversation-list-header">
        <h2>Chats</h2>
        <button type="button" onClick={onNewConversation} title="Start new chat">
          +
        </button>
      </div>

      {conversations.length === 0 && (
        <p className="conversation-list-empty">No conversations yet</p>
      )}

      <ul>
        {conversations.map((conversation) => {
          const label = getConversationLabel(conversation, currentUserId);
          const online = isOtherMemberOnline(conversation, currentUserId);
          const isActive = conversation._id === activeConversationId;
          return (
            <li key={conversation._id}>
              <button
                type="button"
                className={`conversation-item${isActive ? ' active' : ''}`}
                onClick={() => onSelect(conversation._id)}
              >
                <span className={`status-dot${online ? ' online' : ''}`} />
                <span className="conversation-info">
                  <span className="conversation-name">{label}</span>
                  <span className="conversation-preview">
                    {conversation.lastMessage?.text || 'No messages yet'}
                  </span>
                </span>
                {!!conversation.unreadCount && (
                  <span className="unread-badge">{conversation.unreadCount}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
