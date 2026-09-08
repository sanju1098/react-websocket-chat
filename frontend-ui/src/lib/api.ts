// Thin REST API client for the Real-Time Chat backend (see APIDoc.md).
import type {
  AuthResponse,
  Conversation,
  ConversationType,
  MessagesPage,
  User,
} from '../types';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!res.ok || json.success === false) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }

  return json.data as T;
}

export function signup(
  username: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(token: string): Promise<{ user: AuthResponse['user'] }> {
  return request('/api/auth/me', { method: 'GET' }, token);
}

export function listConversations(
  token: string,
): Promise<{ conversations: Conversation[] }> {
  return request('/api/conversations', { method: 'GET' }, token);
}

export function createConversation(
  token: string,
  payload: { type: ConversationType; members: string[]; name?: string },
): Promise<{ conversation: Conversation }> {
  return request(
    '/api/conversations',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function getMessages(
  token: string,
  conversationId: string,
  params: { limit?: number; before?: string } = {},
): Promise<MessagesPage> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.before) query.set('before', params.before);
  const qs = query.toString();
  return request(
    `/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
    token,
  );
}

export function listUsers(
  token: string,
  params: { search?: string; limit?: number } = {},
): Promise<{ users: User[] }> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/api/users${qs ? `?${qs}` : ''}`, { method: 'GET' }, token);
}
