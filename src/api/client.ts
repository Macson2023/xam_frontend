import type {
  AddMembersPayload,
  Chat,
  ChatDetail,
  ChatType,
  CreateChannelPayload,
  CreateCommunityPayload,
  LoginPayload,
  Message,
  MessagePage,
  RegisterPayload,
  TokenResponse,
  UpdateChannelPayload,
  UpdateCommunityPayload,
  User,
} from './types';

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const API_PREFIX = '/api/v1';
const COMMUNITY_SEGMENTS = { group: 'groups', channel: 'channels' } as const;

export type CommunityType = keyof typeof COMMUNITY_SEGMENTS;

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
  const isFormData = options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) {
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
      body:
        options.body === undefined
          ? undefined
          : isFormData
            ? (options.body as FormData)
            : JSON.stringify(options.body),
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

function segmentFor(type: ChatType): string {
  if (type === 'group') {
    return COMMUNITY_SEGMENTS.group;
  }
  if (type === 'channel') {
    return COMMUNITY_SEGMENTS.channel;
  }
  return 'chats';
}

function communityPath(kind: CommunityType, id?: string, suffix?: string): string {
  const base = `/${COMMUNITY_SEGMENTS[kind]}${id ? `/${id}` : ''}`;
  return suffix ? `${base}/${suffix}` : base;
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
  type: ChatType,
  chatId: string,
  token: string,
  params: { limit?: number; before?: string | null } = {},
): Promise<MessagePage> {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit ?? 50));
  if (params.before) {
    search.set('before', params.before);
  }
  return request<MessagePage>(
    `/${segmentFor(type)}/${chatId}/messages?${search.toString()}`,
    { token },
  );
}

export function sendMessage(
  type: ChatType,
  chatId: string,
  payload: { content: string; client_message_id: string },
  token: string,
): Promise<Message> {
  return request<Message>(`/${segmentFor(type)}/${chatId}/messages`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export function sendImage(
  type: ChatType,
  chatId: string,
  payload: { file: File; caption: string; client_message_id: string },
  token: string,
): Promise<Message> {
  const form = new FormData();
  form.append('file', payload.file, payload.file.name);
  const caption = payload.caption.trim();
  if (caption) {
    form.append('caption', caption);
  }
  form.append('client_message_id', payload.client_message_id);
  return request<Message>(`/${segmentFor(type)}/${chatId}/images`, {
    method: 'POST',
    token,
    body: form,
  });
}

export function markChatRead(
  type: ChatType,
  chatId: string,
  token: string,
): Promise<{ updated: number }> {
  return request<{ updated: number }>(`/${segmentFor(type)}/${chatId}/read`, {
    method: 'POST',
    token,
  });
}

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const suffix = url.startsWith('/') ? url : `/${url}`;
  return `${API_ORIGIN}${suffix}`;
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

export function createGroup(payload: CreateCommunityPayload, token: string): Promise<Chat> {
  return request<Chat>(communityPath('group'), { method: 'POST', token, body: payload });
}

export function listGroups(token: string): Promise<Chat[]> {
  return request<Chat[]>(communityPath('group'), { token });
}

export function getGroup(groupId: string, token: string): Promise<ChatDetail> {
  return request<ChatDetail>(communityPath('group', groupId), { token });
}

export function updateGroup(
  groupId: string,
  payload: UpdateCommunityPayload,
  token: string,
): Promise<Chat> {
  return request<Chat>(communityPath('group', groupId), {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export function deleteGroup(groupId: string, token: string): Promise<void> {
  return request<void>(communityPath('group', groupId), { method: 'DELETE', token });
}

export function leaveGroup(groupId: string, token: string): Promise<void> {
  return request<void>(communityPath('group', groupId, 'leave'), { method: 'POST', token });
}

export function listGroupMembers(groupId: string, token: string): Promise<ChatDetail['members']> {
  return request<ChatDetail['members']>(communityPath('group', groupId, 'members'), { token });
}

export function addGroupMembers(
  groupId: string,
  payload: AddMembersPayload,
  token: string,
): Promise<ChatDetail> {
  return request<ChatDetail>(communityPath('group', groupId, 'members'), {
    method: 'POST',
    token,
    body: payload,
  });
}

export function updateGroupMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member',
  token: string,
): Promise<ChatDetail> {
  return request<ChatDetail>(communityPath('group', groupId, `members/${userId}`), {
    method: 'PATCH',
    token,
    body: { role },
  });
}

export function removeGroupMember(
  groupId: string,
  userId: string,
  token: string,
): Promise<void> {
  return request<void>(communityPath('group', groupId, `members/${userId}`), {
    method: 'DELETE',
    token,
  });
}

export function createChannel(payload: CreateChannelPayload, token: string): Promise<Chat> {
  return request<Chat>(communityPath('channel'), { method: 'POST', token, body: payload });
}

export function listChannels(token: string): Promise<Chat[]> {
  return request<Chat[]>(communityPath('channel'), { token });
}

export function getChannel(channelId: string, token: string): Promise<ChatDetail> {
  return request<ChatDetail>(communityPath('channel', channelId), { token });
}

export function updateChannel(
  channelId: string,
  payload: UpdateChannelPayload,
  token: string,
): Promise<Chat> {
  return request<Chat>(communityPath('channel', channelId), {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export function deleteChannel(channelId: string, token: string): Promise<void> {
  return request<void>(communityPath('channel', channelId), { method: 'DELETE', token });
}

export function subscribeChannel(channelId: string, token: string): Promise<ChatDetail> {
  return request<ChatDetail>(communityPath('channel', channelId, 'subscribe'), {
    method: 'POST',
    token,
  });
}

export function unsubscribeChannel(channelId: string, token: string): Promise<void> {
  return request<void>(communityPath('channel', channelId, 'unsubscribe'), {
    method: 'POST',
    token,
  });
}

export function listChannelMembers(
  channelId: string,
  token: string,
): Promise<ChatDetail['members']> {
  return request<ChatDetail['members']>(communityPath('channel', channelId, 'members'), {
    token,
  });
}

export function addChannelMembers(
  channelId: string,
  payload: AddMembersPayload,
  token: string,
): Promise<ChatDetail> {
  return request<ChatDetail>(communityPath('channel', channelId, 'members'), {
    method: 'POST',
    token,
    body: payload,
  });
}

export function updateChannelMemberRole(
  channelId: string,
  userId: string,
  role: 'admin' | 'member',
  token: string,
): Promise<ChatDetail> {
  return request<ChatDetail>(communityPath('channel', channelId, `members/${userId}`), {
    method: 'PATCH',
    token,
    body: { role },
  });
}

export function removeChannelMember(
  channelId: string,
  userId: string,
  token: string,
): Promise<void> {
  return request<void>(communityPath('channel', channelId, `members/${userId}`), {
    method: 'DELETE',
    token,
  });
}

export function getChatDetail(
  type: CommunityType,
  chatId: string,
  token: string,
): Promise<ChatDetail> {
  return type === 'group' ? getGroup(chatId, token) : getChannel(chatId, token);
}

export function updateCommunity(
  type: CommunityType,
  chatId: string,
  payload: UpdateChannelPayload,
  token: string,
): Promise<Chat> {
  return type === 'group'
    ? updateGroup(chatId, payload, token)
    : updateChannel(chatId, payload, token);
}

export function deleteCommunity(
  type: CommunityType,
  chatId: string,
  token: string,
): Promise<void> {
  return type === 'group' ? deleteGroup(chatId, token) : deleteChannel(chatId, token);
}

export function leaveCommunity(
  type: CommunityType,
  chatId: string,
  token: string,
): Promise<void> {
  return type === 'group' ? leaveGroup(chatId, token) : unsubscribeChannel(chatId, token);
}

export function addCommunityMembers(
  type: CommunityType,
  chatId: string,
  payload: AddMembersPayload,
  token: string,
): Promise<ChatDetail> {
  return type === 'group'
    ? addGroupMembers(chatId, payload, token)
    : addChannelMembers(chatId, payload, token);
}

export function updateCommunityMemberRole(
  type: CommunityType,
  chatId: string,
  userId: string,
  role: 'admin' | 'member',
  token: string,
): Promise<ChatDetail> {
  return type === 'group'
    ? updateGroupMemberRole(chatId, userId, role, token)
    : updateChannelMemberRole(chatId, userId, role, token);
}

export function removeCommunityMember(
  type: CommunityType,
  chatId: string,
  userId: string,
  token: string,
): Promise<void> {
  return type === 'group'
    ? removeGroupMember(chatId, userId, token)
    : removeChannelMember(chatId, userId, token);
}

export function listCommunityMembers(
  type: CommunityType,
  chatId: string,
  token: string,
): Promise<ChatDetail['members']> {
  return type === 'group'
    ? listGroupMembers(chatId, token)
    : listChannelMembers(chatId, token);
}
