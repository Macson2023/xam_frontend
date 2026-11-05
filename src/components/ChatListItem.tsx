import type { Chat } from '../api/types';
import { chatAvatar, chatKindLabel, chatTitle, isDirect, memberCountLabel } from '../lib/chat';
import { formatChatTime } from '../lib/format';
import { messagePreview } from '../lib/messages';
import { Avatar } from './Avatar';
import { MegaphoneIcon, UsersIcon } from './Icons';

interface ChatListItemProps {
  chat: Chat;
  currentUserId: string;
  active: boolean;
  online: boolean;
  typing: boolean;
  onSelect: () => void;
}

export function ChatListItem({
  chat,
  currentUserId,
  active,
  online,
  typing,
  onSelect,
}: ChatListItemProps) {
  const last = chat.last_message;
  const isOwnLast = last?.sender_id === currentUserId;
  const preview = typing
    ? 'печатает…'
    : last
      ? `${isOwnLast ? 'Вы: ' : ''}${messagePreview(last)}`
      : chat.type === 'direct'
        ? 'Нет сообщений — напишите первым'
        : memberCountLabel(chat.member_count);
  const timestamp = last?.created_at ?? chat.last_activity;
  const direct = isDirect(chat);

  return (
    <button
      type="button"
      className={`chat-item${active ? ' is-active' : ''}`}
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
    >
      <Avatar
        user={chatAvatar(chat)}
        size={48}
        shape={chat.type === 'direct' ? 'circle' : 'rounded'}
        status={direct && online ? 'online' : undefined}
      />
      <span className="chat-item__body">
        <span className="chat-item__row">
          <span className="chat-item__name">
            {chat.type !== 'direct' ? (
              <span className={`chat-item__kind chat-item__kind--${chat.type}`} title={chatKindLabel(chat)}>
                {chat.type === 'group' ? (
                  <UsersIcon width={13} height={13} />
                ) : (
                  <MegaphoneIcon width={13} height={13} />
                )}
              </span>
            ) : null}
            <span className="chat-item__name-text">{chatTitle(chat)}</span>
          </span>
          <span className="chat-item__time">{formatChatTime(timestamp)}</span>
        </span>
        <span className="chat-item__row chat-item__row--bottom">
          <span className={`chat-item__preview${typing ? ' is-typing' : ''}`}>{preview}</span>
          {chat.unread_count > 0 ? (
            <span className="chat-item__badge">
              {chat.unread_count > 99 ? '99+' : chat.unread_count}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
