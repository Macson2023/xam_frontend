import type { Chat } from '../api/types';
import { formatChatTime } from '../lib/format';
import { messagePreview } from '../lib/messages';
import { Avatar } from './Avatar';

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
      : 'Нет сообщений — напишите первым';

  return (
    <button
      type="button"
      className={`chat-item${active ? ' is-active' : ''}`}
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
    >
      <Avatar user={chat.partner} size={48} status={online ? 'online' : undefined} />
      <span className="chat-item__body">
        <span className="chat-item__row">
          <span className="chat-item__name">{chat.partner.display_name}</span>
          {last ? (
            <span className="chat-item__time">{formatChatTime(last.created_at)}</span>
          ) : null}
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
