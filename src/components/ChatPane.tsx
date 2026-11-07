import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Chat, ChatDetail, User } from '../api/types';
import {
  chatAvatar,
  chatKindLabel,
  chatTitle,
  memberCountLabel,
  roleLabel,
} from '../lib/chat';
import { dayKey, formatDayLabel, formatLastSeen, parseDate } from '../lib/format';
import type { ChatMessage } from '../lib/messages';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import {
  BackIcon,
  LockIcon,
  MegaphoneIcon,
  PhoneIcon,
  SettingsIcon,
  UsersIcon,
  VideoIcon,
} from './Icons';
import { MessageBubble } from './MessageBubble';

interface ChatPaneProps {
  chat: Chat;
  detail: ChatDetail | null;
  currentUser: User;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  online: boolean;
  typingUsers: User[];
  callsAvailable: boolean;
  callBusy: boolean;
  canSend: boolean;
  needsSubscribe: boolean;
  subscribeBusy: boolean;
  subscribeError: string | null;
  onSubscribe: () => void;
  onOpenSettings: () => void;
  onAudioCall: () => void;
  onVideoCall: () => void;
  onSend: (content: string) => void;
  onSendImage: (file: File, caption: string) => void;
  onSendAudio: (file: File, durationSeconds: number) => void;
  onSendVideoNote: (file: File, durationSeconds: number) => void;
  onRetry: (message: ChatMessage) => void;
  onLoadOlder: () => Promise<void>;
  onReload: () => Promise<void>;
  onTyping: () => void;
  onBack: () => void;
}

function TypingBubble({ user }: { user: User }) {
  return (
    <div className="message message--other message--typing">
      <div className="message__avatar">
        <Avatar user={user} size={32} />
      </div>
      <div className="message__bubble typing-bubble" aria-label="Собеседник печатает">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function typingLabel(users: User[]): string {
  if (users.length === 0) {
    return '';
  }
  if (users.length === 1) {
    return `${users[0].display_name} печатает…`;
  }
  if (users.length === 2) {
    return `${users[0].display_name} и ${users[1].display_name} печатают…`;
  }
  return `${users[0].display_name} и ещё ${users.length - 1} печатают…`;
}

export function ChatPane({
  chat,
  detail,
  currentUser,
  messages,
  loading,
  error,
  hasMore,
  online,
  typingUsers,
  callsAvailable,
  callBusy,
  canSend,
  needsSubscribe,
  subscribeBusy,
  subscribeError,
  onSubscribe,
  onOpenSettings,
  onAudioCall,
  onVideoCall,
  onSend,
  onSendImage,
  onSendAudio,
  onSendVideoNote,
  onRetry,
  onLoadOlder,
  onReload,
  onTyping,
  onBack,
}: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const stickRef = useRef(true);
  const restoreRef = useRef<{ height: number; top: number } | null>(null);

  const isDirect = chat.type === 'direct';
  const partner = chat.partner;
  const membersById = useMemo(() => {
    const map = new Map<string, User>();
    if (detail) {
      for (const member of detail.members) {
        map.set(member.user.id, member.user);
      }
    }
    if (partner) {
      map.set(partner.id, partner);
    }
    return map;
  }, [detail, partner]);

  const fallbackSender = useMemo<User>(
    () => ({
      id: 'unknown',
      username: '',
      display_name: 'Участник',
      avatar_url: null,
      created_at: '',
      last_seen: null,
    }),
    [],
  );

  const senderFor = (message: ChatMessage): User => {
    if (message.sender_id === currentUser.id) {
      return currentUser;
    }
    return membersById.get(message.sender_id) ?? fallbackSender;
  };

  useEffect(() => {
    prevCountRef.current = 0;
    stickRef.current = true;
    restoreRef.current = null;
  }, [chat.id]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const restore = restoreRef.current;
    if (restore && messages.length > prevCountRef.current) {
      element.scrollTop = element.scrollHeight - restore.height + restore.top;
      restoreRef.current = null;
      prevCountRef.current = messages.length;
      return;
    }

    if (prevCountRef.current === 0 && messages.length > 0) {
      element.scrollTop = element.scrollHeight;
      prevCountRef.current = messages.length;
      return;
    }

    if (stickRef.current && messages.length !== prevCountRef.current) {
      element.scrollTop = element.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!loading) {
      restoreRef.current = null;
    }
  }, [loading]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  const handleLoadOlder = () => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    restoreRef.current = { height: element.scrollHeight, top: element.scrollTop };
    void onLoadOlder();
  };

  const typing = typingUsers.length > 0;
  const typingText = typingLabel(typingUsers);
  const directStatus = typing
    ? 'печатает…'
    : online
      ? 'в сети'
      : partner
        ? formatLastSeen(partner.last_seen)
        : '';
  const communityStatus = typing
    ? typingText
    : `${memberCountLabel(chat.member_count)} · ${chatKindLabel(chat)}`;
  const statusText = isDirect ? directStatus : communityStatus;
  const statusClass = typing ? ' is-typing' : isDirect && online ? ' is-online' : '';
  const callDisabled = !callsAvailable || callBusy;
  const callHint = !callsAvailable
    ? 'Сервис звонков недоступен'
    : callBusy
      ? 'Уже идёт звонок'
      : 'Позвонить';
  const emptyTitle = chatTitle(chat);
  const avatarShape = isDirect ? 'circle' : 'rounded';

  return (
    <section className="chat">
      <header className="chat__head">
        <button
          type="button"
          className="icon-button chat__back"
          onClick={onBack}
          aria-label="Назад к чатам"
        >
          <BackIcon width={22} height={22} />
        </button>
        <Avatar
          user={chatAvatar(chat)}
          size={42}
          shape={avatarShape}
          status={isDirect && online ? 'online' : undefined}
        />
        <div className="chat__title">
          <span className="chat__name">{emptyTitle}</span>
          <span className={`chat__status${statusClass}`}>{statusText}</span>
        </div>
        {isDirect && partner ? (
          <span className="chat__username">@{partner.username}</span>
        ) : (
          <span className="chat__username chat__username--kind">
            {chat.type === 'group' ? (
              <UsersIcon width={14} height={14} />
            ) : chat.is_public ? (
              <MegaphoneIcon width={14} height={14} />
            ) : (
              <LockIcon width={14} height={14} />
            )}
            {chat.my_role ? roleLabel(chat.my_role) : 'Без подписки'}
          </span>
        )}
        <div className="chat__actions">
          {isDirect ? (
            <>
              <button
                type="button"
                className="icon-button"
                onClick={onAudioCall}
                disabled={callDisabled}
                title={callHint}
                aria-label="Аудиозвонок"
              >
                <PhoneIcon width={19} height={19} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={onVideoCall}
                disabled={callDisabled}
                title={callHint}
                aria-label="Видеозвонок"
              >
                <VideoIcon width={20} height={20} />
              </button>
            </>
          ) : chat.my_role !== null ? (
            <button
              type="button"
              className="icon-button"
              onClick={onOpenSettings}
              title="Настройки"
              aria-label="Настройки чата"
            >
              <SettingsIcon width={19} height={19} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="chat__body" ref={scrollRef} onScroll={handleScroll}>
        <div className="chat__messages">
          {hasMore ? (
            <div className="chat__load-more">
              <button
                type="button"
                className="button button--ghost"
                onClick={handleLoadOlder}
                disabled={loading}
              >
                {loading ? <span className="spinner spinner--dark" /> : null}
                Показать более ранние
              </button>
            </div>
          ) : null}

          {loading && messages.length === 0 ? (
            <div className="chat__state">
              <span className="spinner" />
              <span>Загружаем сообщения…</span>
            </div>
          ) : null}

          {!loading && error && messages.length === 0 ? (
            <div className="chat__state chat__state--error">
              <span>{error}</span>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void onReload()}
              >
                Повторить
              </button>
            </div>
          ) : null}

          {needsSubscribe ? (
            <div className="chat__subscribe">
              <span className="chat__subscribe-icon">
                <MegaphoneIcon width={26} height={26} />
              </span>
              <strong>Подпишитесь на канал</strong>
              <span>
                Читать сообщения и получать обновления могут подписчики. Это публичный канал —
                подписка доступна в один клик.
              </span>
              {subscribeError ? (
                <span className="chat__subscribe-error" role="alert">
                  {subscribeError}
                </span>
              ) : null}
              <button
                type="button"
                className="button button--primary"
                onClick={onSubscribe}
                disabled={subscribeBusy}
              >
                {subscribeBusy ? <span className="spinner spinner--small" /> : null}
                Подписаться
              </button>
            </div>
          ) : null}

          {!needsSubscribe && !loading && !error && messages.length === 0 ? (
            <div className="chat__start">
              <Avatar user={chatAvatar(chat)} size={56} shape={avatarShape} />
              <strong>{emptyTitle}</strong>
              <span>
                {isDirect
                  ? 'Это начало вашего диалога. Напишите первое сообщение.'
                  : chat.type === 'group'
                    ? 'Это начало истории группы. Напишите первое сообщение.'
                    : 'В канале пока нет сообщений.'}
              </span>
              {!isDirect && chat.description ? (
                <span className="chat__start-description">{chat.description}</span>
              ) : null}
            </div>
          ) : null}

          {messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const next = index + 1 < messages.length ? messages[index + 1] : null;
            const showDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
            const isOwn = message.sender_id === currentUser.id;
            const grouped = Boolean(
              previous &&
                previous.sender_id === message.sender_id &&
                !showDay &&
                parseDate(message.created_at).getTime() -
                  parseDate(previous.created_at).getTime() <
                  5 * 60_000,
            );
            const showAvatar = !next || next.sender_id !== message.sender_id;

            return (
              <div key={message.id}>
                {showDay ? (
                  <div className="chat__day">
                    <span>{formatDayLabel(message.created_at)}</span>
                  </div>
                ) : null}
                <MessageBubble
                  message={message}
                  sender={senderFor(message)}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  showAuthor={!isDirect}
                  grouped={grouped}
                  onRetry={onRetry}
                />
              </div>
            );
          })}

          {typing && typingUsers[0] ? <TypingBubble user={typingUsers[0]} /> : null}
        </div>
      </div>

      {error && messages.length > 0 ? (
        <div className="chat__inline-error">{error}</div>
      ) : null}

      {needsSubscribe ? (
        <div className="chat__readonly">
          <LockIcon width={17} height={17} />
          <span>Подпишитесь, чтобы читать сообщения и получать обновления канала.</span>
          <button
            type="button"
            className="button button--primary"
            onClick={onSubscribe}
            disabled={subscribeBusy}
          >
            {subscribeBusy ? <span className="spinner spinner--small" /> : null}
            Подписаться
          </button>
        </div>
      ) : canSend ? (
        <Composer
          onSend={onSend}
          onSendImage={onSendImage}
          onSendAudio={onSendAudio}
          onSendVideoNote={onSendVideoNote}
          onTyping={onTyping}
        />
      ) : (
        <div className="chat__readonly">
          <LockIcon width={17} height={17} />
          <span>
            {chat.type === 'channel'
              ? 'Писать в канале могут только владелец и администраторы.'
              : 'Отправка сообщений недоступна.'}
          </span>
        </div>
      )}
    </section>
  );
}
