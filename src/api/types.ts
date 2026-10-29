export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  last_seen: string | null;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  client_message_id: string | null;
  created_at: string;
  is_read: boolean;
}

export interface Chat {
  id: string;
  partner: User;
  created_at: string;
  last_activity: string;
  unread_count: number;
  last_message: Message | null;
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

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export type ServerEvent =
  | { type: 'new_message'; data: Message }
  | { type: 'user_status'; data: { user_id: string; status: 'online' | 'offline' } }
  | { type: 'typing'; data: { chat_id: string; user_id: string; is_typing: boolean } }
  | { type: 'pong' }
  | { type: 'error'; data: { detail: string } };
