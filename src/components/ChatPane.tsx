import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Chat, User } from '../api/types';
import { dayKey, formatDayLabel, formatLastSeen, parseDate } from '../lib/format';
import type { ChatMessage } from '../lib/messages';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { BackIcon } from './Icons';
import { MessageBubble } from './MessageBubble';

interface ChatPaneProps {
  chat: Chat;
  currentUser: User;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  online: boolean;
  typing: boolean;
  onSend: (content: string) => void;
  onSendImage: (file: File, caption: string) => void;
  onRetry: (message: ChatMessage) => void;
  onLoadOlder: () => Promise<void>;
  onReload: () => Promise<void>;
  onTyping: () => void;
  onBack: () => void;
}

function TypingBubble({ partner }: { partner: User }) {
  return (
    <div className="message message--other message--typing">
      <div className="message__avatar">
        <Avatar user={partner} size={32} />
      </div>
      <div className="message__bubble typing-bubble" aria-label="Собеседник печатает">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function ChatPane({
  chat,
  currentUser,
  messages,
  loading,
  error,
  hasMore,
  online,
  typing,
  onSend,
  onSendImage,
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

  const partnerOnline = online;
  const statusText = typing
    ? 'печатает…'
    : partnerOnline
      ? 'в сети'
      : formatLastSeen(chat.partner.last_seen);

  return (
    <section className="chat">
      <header className="chat__head">
        <button
          type="button"
          className="icon-button chat__back"
          onClick={onBack}
          aria-label="Назад к диалогам"
        >
          <BackIcon width={22} height={22} />
        </button>
        <Avatar
          user={chat.partner}
          size={42}
          status={partnerOnline ? 'online' : undefined}
        />
        <div className="chat__title">
          <span className="chat__name">{chat.partner.display_name}</span>
          <span
            className={`chat__status${typing ? ' is-typing' : ''}${partnerOnline ? ' is-online' : ''}`}
          >
            {statusText}
          </span>
        </div>
        <span className="chat__username">@{chat.partner.username}</span>
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

          {!loading && !error && messages.length === 0 ? (
            <div className="chat__start">
              <Avatar user={chat.partner} size={56} />
              <strong>{chat.partner.display_name}</strong>
              <span>Это начало вашего диалога. Напишите первое сообщение.</span>
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
                  partner={chat.partner}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  grouped={grouped}
                  onRetry={onRetry}
                />
              </div>
            );
          })}

          {typing ? <TypingBubble partner={chat.partner} /> : null}
        </div>
      </div>

      {error && messages.length > 0 ? (
        <div className="chat__inline-error">{error}</div>
      ) : null}

      <Composer onSend={onSend} onSendImage={onSendImage} onTyping={onTyping} />
    </section>
  );
}
