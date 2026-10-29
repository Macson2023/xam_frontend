import type { Chat, ConnectionStatus, User } from '../api/types';
import { Avatar } from './Avatar';
import { ChatListItem } from './ChatListItem';
import { ChatIcon, LogoutIcon } from './Icons';
import { Logo } from './Logo';
import { UserSearch } from './UserSearch';

interface SidebarProps {
  user: User;
  token: string;
  chats: Chat[];
  loading: boolean;
  error: string | null;
  activeChatId: string | null;
  online: Record<string, boolean>;
  typing: Record<string, boolean>;
  connection: ConnectionStatus;
  onSelectChat: (chatId: string) => void;
  onStartChat: (user: User) => Promise<void>;
  onLogout: () => void;
  onUnauthorized: () => void;
  onRetry: () => void;
}

const connectionLabel: Record<ConnectionStatus, string> = {
  connecting: 'Подключение…',
  online: 'На связи',
  reconnecting: 'Переподключение…',
  offline: 'Нет соединения',
};

export function Sidebar({
  user,
  token,
  chats,
  loading,
  error,
  activeChatId,
  online,
  typing,
  connection,
  onSelectChat,
  onStartChat,
  onLogout,
  onUnauthorized,
  onRetry,
}: SidebarProps) {
  const totalUnread = chats.reduce((sum, chat) => sum + chat.unread_count, 0);

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <div className="sidebar__brand">
          <Logo size={32} />
          <span className="sidebar__brand-name">xam</span>
          <span
            className={`connection connection--${connection}`}
            title={connectionLabel[connection]}
          >
            <span className="connection__dot" />
            {connectionLabel[connection]}
          </span>
        </div>

        <div className="me">
          <Avatar user={user} size={40} />
          <div className="me__text">
            <span className="me__name">{user.display_name}</span>
            <span className="me__username">@{user.username}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onLogout}
            title="Выйти"
            aria-label="Выйти из аккаунта"
          >
            <LogoutIcon width={18} height={18} />
          </button>
        </div>
      </div>

      <UserSearch
        token={token}
        currentUserId={user.id}
        onStartChat={onStartChat}
        onUnauthorized={onUnauthorized}
      />

      <div className="sidebar__list-head">
        <span>Диалоги</span>
        {totalUnread > 0 ? <span className="sidebar__unread">{totalUnread}</span> : null}
      </div>

      <div className="sidebar__list">
        {loading ? (
          <div className="sidebar__state">
            <span className="spinner" />
            <span>Загружаем диалоги…</span>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="sidebar__state sidebar__state--error">
            <span>{error}</span>
            <button type="button" className="button button--ghost" onClick={onRetry}>
              Повторить
            </button>
          </div>
        ) : null}

        {!loading && !error && chats.length === 0 ? (
          <div className="sidebar__empty">
            <span className="sidebar__empty-icon">
              <ChatIcon width={26} height={26} />
            </span>
            <strong>Пока нет диалогов</strong>
            <span>Найдите собеседника по username — диалог появится здесь.</span>
          </div>
        ) : null}

        {!loading && !error
          ? chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                currentUserId={user.id}
                active={chat.id === activeChatId}
                online={online[chat.partner.id] === true}
                typing={typing[chat.id] === true}
                onSelect={() => onSelectChat(chat.id)}
              />
            ))
          : null}
      </div>

      <div className="sidebar__foot">
        <span>xam messenger · MVP</span>
        <span className="sidebar__foot-hint">Бэкенд: FastAPI + WebSocket</span>
      </div>
    </aside>
  );
}
