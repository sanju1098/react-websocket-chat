// Message thread view for the active conversation.
import { useEffect, useRef } from 'react';
import type { Message, User } from '../types';
import './ChatWindow.css';

interface Props {
  messages: Message[];
  currentUserId: string;
  typingUsers: Record<string, string>;
  loading: boolean;
  title: string;
  subtitle: string;
  onVisibleLastMessage: (messageId: string) => void;
}

function getSenderId(message: Message): string {
  return typeof message.senderId === 'string' ? message.senderId : message.senderId._id;
}

function getSenderName(message: Message): string {
  return typeof message.senderId === 'string' ? '' : (message.senderId as User).username;
}

function statusLabel(status: Message['status']): string {
  if (status === 'read') return 'Read';
  if (status === 'delivered') return 'Delivered';
  return 'Sent';
}

export default function ChatWindow({
  messages,
  currentUserId,
  typingUsers,
  loading,
  title,
  subtitle,
  onVisibleLastMessage,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
    const last = messages[messages.length - 1];
    if (last && getSenderId(last) !== currentUserId) {
      onVisibleLastMessage(last._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const typingNames = Object.values(typingUsers);

  return (
    <div className="chat-window">
      <header className="chat-window-header">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>

      <div className="chat-window-body">
        {loading && <p className="chat-window-hint">Loading messages…</p>}
        {!loading && messages.length === 0 && (
          <p className="chat-window-hint">No messages yet. Say hello!</p>
        )}

        {messages.map((message) => {
          const isOwn = getSenderId(message) === currentUserId;
          return (
            <div key={message._id} className={`message-row${isOwn ? ' own' : ''}`}>
              <div className="message-bubble">
                {!isOwn && <span className="message-sender">{getSenderName(message)}</span>}
                <p className="message-text">{message.text}</p>
                <span className="message-meta">
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {isOwn && (
                    <span
                      className={`message-status${message.status === 'read' ? ' read' : ''}`}
                    >
                      {' '}
                      {statusLabel(message.status)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}

        {typingNames.length > 0 && (
          <p className="typing-indicator">{typingNames.join(', ')} typing…</p>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
