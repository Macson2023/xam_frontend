import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from './api/types';
import { useAuth } from './auth/AuthContext';
import { CallOverlay } from './components/CallOverlay';
import { ChatPane } from './components/ChatPane';
import { ChatSettingsDialog } from './components/ChatSettingsDialog';
import { CreateChatDialog, type CommunityDraft } from './components/CreateChatDialog';
import { CloseIcon } from './components/Icons';
import { EmptyChat } from './components/EmptyChat';
import { OpenChannelDialog } from './components/OpenChannelDialog';
import { Sidebar } from './components/Sidebar';
import { useCalls } from './hooks/useCalls';
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
  const calls = useCalls(token, user, handleUnauthorized);
  const { activeChat, activeDetail } = messenger;
  const [createKind, setCreateKind] = useState<'group' | 'channel' | null>(null);
  const [openChannelVisible, setOpenChannelVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSettingsOpen(false);
  }, [messenger.activeChatId]);

  const typingUsers = useMemo<User[]>(() => {
    if (!activeChat) {
      return [];
    }
    const ids = messenger.typingUserIds[activeChat.id] ?? [];
    if (ids.length === 0) {
      return [];
    }
    const members = new Map<string, User>();
    if (activeDetail) {
      for (const member of activeDetail.members) {
        members.set(member.user.id, member.user);
      }
    }
    if (activeChat.partner) {
      members.set(activeChat.partner.id, activeChat.partner);
    }
    return ids.map(
      (id) =>
        members.get(id) ?? {
          id,
          username: '',
          display_name: 'Участник',
          avatar_url: null,
          created_at: '',
          last_seen: null,
        },
    );
  }, [activeChat, activeDetail, messenger.typingUserIds]);

  const directPartner = activeChat?.type === 'direct' ? activeChat.partner : null;
  const directOnline = directPartner ? messenger.online[directPartner.id] === true : false;

  const handleCreate = async (draft: CommunityDraft) => {
    if (createKind === 'group') {
      await messenger.createGroup({
        title: draft.title,
        description: draft.description || null,
        avatar_url: draft.avatar_url || null,
        member_ids: draft.member_ids,
      });
    } else if (createKind === 'channel') {
      await messenger.createChannel({
        title: draft.title,
        description: draft.description || null,
        avatar_url: draft.avatar_url || null,
        is_public: draft.is_public,
        member_ids: draft.member_ids,
      });
    }
    setCreateKind(null);
  };

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
        onCreateGroup={() => setCreateKind('group')}
        onCreateChannel={() => setCreateKind('channel')}
        onOpenChannel={() => setOpenChannelVisible(true)}
        onLogout={() => logout()}
        onUnauthorized={handleUnauthorized}
        onRetry={() => void messenger.refreshChats()}
      />

      <main className="main-pane">
        {activeChat ? (
          <ChatPane
            key={activeChat.id}
            chat={activeChat}
            detail={activeDetail}
            currentUser={user}
            messages={messenger.messages}
            loading={messenger.messagesLoading}
            error={messenger.messagesError ?? messenger.detailError}
            hasMore={messenger.hasMoreMessages}
            online={directOnline}
            typingUsers={typingUsers}
            callsAvailable={calls.connection === 'online'}
            callBusy={calls.session !== null}
            canSend={messenger.canSendActive}
            needsSubscribe={messenger.needsSubscribeActive}
            subscribeBusy={messenger.subscribeBusy}
            subscribeError={messenger.subscribeError}
            onSubscribe={() => void messenger.subscribeActiveChannel()}
            onOpenSettings={() => setSettingsOpen(true)}
            onAudioCall={() => {
              if (directPartner) {
                void calls.startCall(directPartner, 'audio');
              }
            }}
            onVideoCall={() => {
              if (directPartner) {
                void calls.startCall(directPartner, 'video');
              }
            }}
            onSend={(content) => void messenger.sendMessage(content)}
            onSendImage={(file, caption) => void messenger.sendImage(file, caption)}
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

      {createKind ? (
        <CreateChatDialog
          kind={createKind}
          token={token}
          currentUser={user}
          onClose={() => setCreateKind(null)}
          onCreate={handleCreate}
          onUnauthorized={handleUnauthorized}
        />
      ) : null}

      {openChannelVisible ? (
        <OpenChannelDialog
          onClose={() => setOpenChannelVisible(false)}
          onOpen={async (channelId) => {
            await messenger.openChannelById(channelId);
            setOpenChannelVisible(false);
          }}
          onUnauthorized={handleUnauthorized}
        />
      ) : null}

      {settingsOpen && activeChat && activeChat.type !== 'direct' ? (
        <ChatSettingsDialog
          chat={activeDetail ?? activeChat}
          detail={activeDetail}
          currentUser={user}
          token={token}
          loading={messenger.detailLoading}
          loadError={messenger.detailError}
          onClose={() => setSettingsOpen(false)}
          onUpdate={messenger.updateActiveCommunity}
          onAddMembers={messenger.addActiveMembers}
          onUpdateRole={messenger.updateActiveMemberRole}
          onRemoveMember={messenger.removeActiveMember}
          onLeave={messenger.leaveActiveCommunity}
          onDelete={messenger.deleteActiveCommunity}
          onRefresh={messenger.refreshActiveDetail}
          onUnauthorized={handleUnauthorized}
        />
      ) : null}

      {calls.session ? (
        <CallOverlay
          session={calls.session}
          localStream={calls.localStream}
          remoteStream={calls.remoteStream}
          muted={calls.muted}
          cameraEnabled={calls.cameraEnabled}
          elapsed={calls.elapsed}
          error={calls.error}
          onAccept={() => void calls.acceptCall()}
          onReject={calls.rejectCall}
          onHangup={calls.hangup}
          onToggleMute={calls.toggleMute}
          onToggleCamera={calls.toggleCamera}
          onDismissError={calls.clearError}
        />
      ) : calls.error ? (
        <div className="call-toast" role="alert">
          <span>{calls.error}</span>
          <button
            type="button"
            className="icon-button"
            onClick={calls.clearError}
            aria-label="Закрыть уведомление"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
