// Text input + send button for composing messages, with typing-start events.
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import './MessageInput.css';

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
  onTyping: () => void;
}

export default function MessageInput({ disabled, onSend, onTyping }: Props) {
  const [text, setText] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTyping();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type a message…"
        rows={1}
        maxLength={5000}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
}
