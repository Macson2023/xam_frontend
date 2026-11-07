export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  last_seen: string | null;
}

export type MessageType = 'text' | 'image' | 'audio' | 'video_note';
export type ChatType = 'direct' | 'group' | 'channel';
export type MemberRole = 'owner' | 'admin' | 'member';

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  image_url: string | null;
  image_mime_type: string | null;
  image_size_bytes: number | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_size_bytes: number | null;
  media_duration_seconds: number | null;
  client_message_id: string | null;
  created_at: string;
  is_read: boolean;
}

export interface Chat {
  id: string;
  type: ChatType;
  partner: User | null;
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  owner_id: string | null;
  is_public: boolean;
  member_count: number;
  my_role: MemberRole | null;
  created_at: string;
  last_activity: string;
  unread_count: number;
  last_message: Message | null;
}

export interface ChatMember {
  user: User;
  role: MemberRole;
  joined_at: string;
  last_read_at: string | null;
}

export interface ChatDetail extends Chat {
  members: ChatMember[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface MessagePage {
  items: Message[];
  next_cursor: string | null;
}

export interface RegisterPayload {
  username: string;
  password: string;
  display_name: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface CreateCommunityPayload {
  title: string;
  description?: string | null;
  avatar_url?: string | null;
  member_ids?: string[];
}

export interface CreateChannelPayload extends CreateCommunityPayload {
  is_public?: boolean;
}

export interface UpdateCommunityPayload {
  title?: string;
  description?: string | null;
  avatar_url?: string | null;
}

export interface UpdateChannelPayload extends UpdateCommunityPayload {
  is_public?: boolean;
}

export interface AddMembersPayload {
  user_ids: string[];
  role?: 'admin' | 'member';
}

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export type ServerEvent =
  | { type: 'new_message'; data: Message }
  | { type: 'user_status'; data: { user_id: string; status: 'online' | 'offline' } }
  | { type: 'typing'; data: { chat_id: string; user_id: string; is_typing: boolean } }
  | { type: 'pong' }
  | { type: 'error'; data: { detail: string } };
