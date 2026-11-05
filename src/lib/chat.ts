import type { Chat, MemberRole } from '../api/types';

export interface AvatarSource {
  id: string;
  display_name: string;
  avatar_url: string | null;
  username?: string | null;
}

export function isCommunity(chat: Chat): chat is Chat & { type: 'group' | 'channel' } {
  return chat.type === 'group' || chat.type === 'channel';
}

export function isDirect(chat: Chat): chat is Chat & { partner: NonNullable<Chat['partner']> } {
  return chat.type === 'direct' && chat.partner !== null;
}

export function chatTitle(chat: Chat): string {
  if (chat.type === 'direct') {
    return chat.partner?.display_name ?? 'Личный диалог';
  }
  return chat.title ?? (chat.type === 'group' ? 'Группа без названия' : 'Канал без названия');
}

export function chatAvatar(chat: Chat): AvatarSource {
  if (chat.type === 'direct' && chat.partner) {
    return chat.partner;
  }
  return {
    id: chat.id,
    display_name: chatTitle(chat),
    avatar_url: chat.avatar_url,
    username: null,
  };
}

export function chatKindLabel(chat: Chat): string {
  if (chat.type === 'group') {
    return 'Группа';
  }
  if (chat.type === 'channel') {
    return chat.is_public ? 'Публичный канал' : 'Приватный канал';
  }
  return 'Личный диалог';
}

export function memberCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'участников';
  if (mod10 === 1 && mod100 !== 11) {
    word = 'участник';
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = 'участника';
  }
  return `${count} ${word}`;
}

export function roleLabel(role: MemberRole): string {
  if (role === 'owner') {
    return 'Владелец';
  }
  if (role === 'admin') {
    return 'Администратор';
  }
  return 'Участник';
}

export function canPost(chat: Chat): boolean {
  if (chat.type === 'direct') {
    return true;
  }
  if (chat.type === 'group') {
    return chat.my_role !== null;
  }
  return chat.my_role === 'owner' || chat.my_role === 'admin';
}

export function canRead(chat: Chat): boolean {
  return chat.type === 'direct' || chat.my_role !== null;
}

export function needsSubscription(chat: Chat): boolean {
  return chat.type === 'channel' && chat.my_role === null && chat.is_public;
}

export function isOwner(chat: Chat): boolean {
  return chat.my_role === 'owner';
}

export function canManageMembers(chat: Chat): boolean {
  return chat.my_role === 'owner' || chat.my_role === 'admin';
}

export function canRemoveMember(chat: Chat, targetRole: MemberRole): boolean {
  if (targetRole === 'owner') {
    return false;
  }
  if (chat.my_role === 'owner') {
    return true;
  }
  return chat.my_role === 'admin' && targetRole === 'member';
}
