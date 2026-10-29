import type {
  Chat,
  LoginPayload,
  Message,
  MessagePage,
  RegisterPayload,
  TokenResponse,
  User,
} from './types';

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const API_PREFIX = '/api/v1';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${API_PREFIX}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте, запущен ли бэкенд.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : `Ошибка запроса (${response.status})`;
    throw new ApiError(response.status, detail);
  }

  return data as T;
}

export function register(payload: RegisterPayload): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/register', { method: 'POST', body: payload });
}

export function login(payload: LoginPayload): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/login', { method: 'POST', body: payload });
}

export function getMe(token: string): Promise<User> {
  return request<User>('/users/me', { token });
}

export function searchUsers(query: string, token: string, signal?: AbortSignal): Promise<User[]> {
  return request<User[]>(`/users/search?q=${encodeURIComponent(query)}&limit=20`, {
    token,
    signal,
  });
}

export function listChats(token: string): Promise<Chat[]> {
  return request<Chat[]>('/chats', { token });
}

export function createChat(participantId: string, token: string): Promise<Chat> {
  return request<Chat>('/chats', {
    method: 'POST',
    token,
    body: { participant_id: participantId },
  });
}

export function getMessages(
  chatId: string,
  token: string,
  params: { limit?: number; before?: string | null } = {},
): Promise<MessagePage> {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit ?? 50));
  if (params.before) {
    search.set('before', params.before);
  }
  return request<MessagePage>(`/chats/${chatId}/messages?${search.toString()}`, { token });
}

export function sendMessage(
  chatId: string,
  payload: { content: string; client_message_id: string },
  token: string,
): Promise<Message> {
  return request<Message>(`/chats/${chatId}/messages`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export function markChatRead(chatId: string, token: string): Promise<{ updated: number }> {
  return request<{ updated: number }>(`/chats/${chatId}/read`, {
    method: 'POST',
    token,
  });
}

export function buildWebSocketUrl(token: string): string {
  const configured = (import.meta.env.VITE_WS_URL || API_ORIGIN).replace(/\/+$/, '');
  if (configured) {
    const base = configured.replace(/^http/, 'ws');
    return `${base}/ws?token=${encodeURIComponent(token)}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}
