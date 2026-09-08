// Modal to start a new 1:1 conversation by searching and selecting a user by name.
import { useEffect, useState } from 'react';
import { listUsers } from '../lib/api';
import type { User } from '../types';
import './NewConversationModal.css';

interface Props {
  token: string;
  onClose: () => void;
  onCreate: (memberId: string) => Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 300;

export default function NewConversationModal({ token, onClose, onCreate }: Props) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoadingUsers(true);
      try {
        const { users: results } = await listUsers(token, { search: search.trim() || undefined });
        setUsers(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setLoadingUsers(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, token]);

  async function handleCreate() {
    if (!selectedUserId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(selectedUserId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>Start a new chat</h3>

        <label className="field">
          <span>Search by name</span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedUserId(null);
            }}
            placeholder="Type a username…"
            autoFocus
          />
        </label>

        <ul className="user-select-list">
          {loadingUsers && <li className="user-select-hint">Searching…</li>}
          {!loadingUsers && users.length === 0 && (
            <li className="user-select-hint">No users found</li>
          )}
          {!loadingUsers &&
            users.map((u) => (
              <li key={u._id}>
                <button
                  type="button"
                  className={`user-select-item${selectedUserId === u._id ? ' selected' : ''}`}
                  onClick={() => setSelectedUserId(u._id)}
                >
                  <span className={`status-dot${u.status === 'online' ? ' online' : ''}`} />
                  <span className="user-select-name">{u.username}</span>
                </button>
              </li>
            ))}
        </ul>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!selectedUserId || submitting} onClick={handleCreate}>
            {submitting ? 'Creating…' : 'Start chat'}
          </button>
        </div>
      </div>
    </div>
  );
}
