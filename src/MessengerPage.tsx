import { useCallback } from 'react';
import type { User } from './api/types';
import { useAuth } from './auth/AuthContext';
import { ChatPane } from './components/ChatPane';
import { EmptyChat } from './components/EmptyChat';
import { Sidebar } from './components/Sidebar';
import { useMessenger } from './hooks/useMessenger';

interface MessengerPageProps {
  token: string;
  user: User;
}

const connectionText = {
  connecting: 'Подключаемся к серверу…',
  online: '',
  reconnecting: 'Соединение потеряно — переподключаемся…',
  offline: 'Нет соединения с сервером',
};

export function MessengerPage({ token, user }: MessengerPageProps) {
  const { logout } = useAuth();
  const handleUnauthorized = useCallback(() => {
    logout('Сессия истекла. Войдите снова.');
  }, [logout]);

  const messenger = useMessenger(token, user, handleUnauthorized);
  const { activeChat } = messenger;

  return (
    <div className={`app-shell${activeChat ? ' has-chat' : ''}`}>
      <Sidebar
        user={user}
        token={token}
        chats={messenger.chats}
        loading={messenger.chatsLoading}
        error={messenger.chatsError}
        activeChatId={messenger.activeChatId}
        online={messenger.online}
        typing={messenger.typing}
        connection={messenger.connection}
        onSelectChat={messenger.selectChat}
        onStartChat={messenger.startChat}
        onLogout={() => logout()}
        onUnauthorized={handleUnauthorized}
        onRetry={() => void messenger.refreshChats()}
      />

      <main className="main-pane">
        {activeChat ? (
          <ChatPane
            key={activeChat.id}
            chat={activeChat}
            currentUser={user}
            messages={messenger.messages}
            loading={messenger.messagesLoading}
            error={messenger.messagesError}
            hasMore={messenger.hasMoreMessages}
            online={messenger.online[activeChat.partner.id] === true}
            typing={messenger.typing[activeChat.id] === true}
            onSend={(content) => void messenger.sendMessage(content)}
            onRetry={(message) => void messenger.retryMessage(message)}
            onLoadOlder={messenger.loadOlder}
            onReload={messenger.reload}
            onTyping={messenger.notifyTyping}
            onBack={messenger.closeChat}
          />
        ) : (
          <EmptyChat />
        )}
      </main>

      {messenger.connection !== 'online' ? (
        <div className="connection-banner" role="status">
          <span className="spinner spinner--small" />
          {connectionText[messenger.connection]}
        </div>
      ) : null}
    </div>
  );
}
