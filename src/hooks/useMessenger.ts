import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { ApiError } from '../api/client';
import type { Chat, ConnectionStatus, Message, ServerEvent, User } from '../api/types';
import {
  markMessageFailed,
  markMessagePending,
  mergeMessages,
  type ChatMessage,
} from '../lib/messages';
import { createUuid } from '../lib/uuid';
import { useRealtime } from './useRealtime';

const PAGE_SIZE = 50;
const TYPING_THROTTLE = 2_000;
const TYPING_RESET = 2_500;
const TYPING_HIDE = 4_000;

export interface MessengerState {
  chats: Chat[];
  chatsLoading: boolean;
  chatsError: string | null;
  activeChat: Chat | null;
  activeChatId: string | null;
  messages: ChatMessage[];
  messagesLoading: boolean;
  messagesError: string | null;
  hasMoreMessages: boolean;
  connection: ConnectionStatus;
  online: Record<string, boolean>;
  typing: Record<string, boolean>;
  selectChat: (chatId: string) => void;
  closeChat: () => void;
  startChat: (participant: User) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  sendImage: (file: File, caption: string) => Promise<void>;
  retryMessage: (message: ChatMessage) => Promise<void>;
  loadOlder: () => Promise<void>;
  reload: () => Promise<void>;
  notifyTyping: () => void;
  refreshChats: () => Promise<void>;
}

function byActivity(a: Chat, b: Chat): number {
  return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function failureText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useMessenger(
  token: string,
  user: User,
  onUnauthorized: () => void,
): MessengerState {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({});
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [loadedChats, setLoadedChats] = useState<Record<string, boolean>>({});
  const [loadingChats, setLoadingChats] = useState<Record<string, boolean>>({});
  const [messagesError, setMessagesError] = useState<Record<string, string | null>>({});
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [typing, setTyping] = useState<Record<string, boolean>>({});

  const activeChatIdRef = useRef<string | null>(null);
  const typingSentAt = useRef<Record<string, number>>({});
  const typingStopTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingHideTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const connectedOnce = useRef(false);

  const selectChat = useCallback(
    (chatId: string) => {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setChats((prev) =>
        prev.map((chat) => (chat.id === chatId ? { ...chat, unread_count: 0 } : chat)),
      );
      api
        .markChatRead(chatId, token)
        .then(() => {
          setChats((prev) =>
            prev.map((chat) => (chat.id === chatId ? { ...chat, unread_count: 0 } : chat)),
          );
        })
        .catch((error: unknown) => {
          if (isUnauthorized(error)) {
            onUnauthorized();
          }
        });
    },
    [token, onUnauthorized],
  );

  const closeChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
  }, []);

  const refreshChats = useCallback(async () => {
    try {
      const items = await api.listChats(token);
      const currentChatId = activeChatIdRef.current;
      setChats(
        items.map((chat) =>
          chat.id === currentChatId ? { ...chat, unread_count: 0 } : chat,
        ),
      );
      setChatsError(null);
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      setChatsError(error instanceof Error ? error.message : 'Не удалось загрузить чаты');
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    let cancelled = false;
    setChatsLoading(true);
    api
      .listChats(token)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setChats(items);
        setChatsError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setChatsError(error instanceof Error ? error.message : 'Не удалось загрузить чаты');
      })
      .finally(() => {
        if (!cancelled) {
          setChatsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, onUnauthorized]);

  useEffect(() => {
    if (activeChatId || chats.length === 0) {
      return;
    }
    if (window.matchMedia('(min-width: 900px)').matches) {
      selectChat(chats[0].id);
    }
  }, [chats, activeChatId, selectChat]);

  const loadMessages = useCallback(
    async (chatId: string) => {
      setLoadingChats((prev) => ({ ...prev, [chatId]: true }));
      setMessagesError((prev) => ({ ...prev, [chatId]: null }));
      try {
        const page = await api.getMessages(chatId, token, { limit: PAGE_SIZE });
        const chronological = [...page.items].reverse();
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: mergeMessages(prev[chatId] ?? [], chronological),
        }));
        setCursors((prev) => ({ ...prev, [chatId]: page.next_cursor }));
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setMessagesError((prev) => ({
          ...prev,
          [chatId]: error instanceof Error ? error.message : 'Не удалось загрузить сообщения',
        }));
      } finally {
        setLoadingChats((prev) => ({ ...prev, [chatId]: false }));
        setLoadedChats((prev) => ({ ...prev, [chatId]: true }));
      }
    },
    [token, onUnauthorized],
  );

  const reload = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    if (chatId) {
      await loadMessages(chatId);
    }
  }, [loadMessages]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    if (loadedChats[activeChatId] || loadingChats[activeChatId]) {
      return;
    }
    void loadMessages(activeChatId);
  }, [activeChatId, loadedChats, loadingChats, loadMessages]);

  const loadOlder = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    if (!chatId) {
      return;
    }
    const cursor = cursors[chatId];
    if (!cursor || loadingChats[chatId]) {
      return;
    }
    setLoadingChats((prev) => ({ ...prev, [chatId]: true }));
    try {
      const page = await api.getMessages(chatId, token, { limit: PAGE_SIZE, before: cursor });
      const chronological = [...page.items].reverse();
      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: mergeMessages(prev[chatId] ?? [], chronological),
      }));
      setCursors((prev) => ({ ...prev, [chatId]: page.next_cursor }));
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      setMessagesError((prev) => ({
        ...prev,
        [chatId]: error instanceof Error ? error.message : 'Не удалось загрузить историю',
      }));
    } finally {
      setLoadingChats((prev) => ({ ...prev, [chatId]: false }));
    }
  }, [cursors, loadingChats, token, onUnauthorized]);

  const touchChat = useCallback((chatId: string, message: Message) => {
    setChats((prev) => {
      const next = prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              last_message: message,
              last_activity: message.created_at,
            }
          : chat,
      );
      return [...next].sort(byActivity);
    });
  }, []);

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const chatId = activeChatIdRef.current;
      const content = rawContent.trim();
      if (!chatId || !content) {
        return;
      }

      const clientMessageId = createUuid();
      const optimistic: ChatMessage = {
        id: clientMessageId,
        chat_id: chatId,
        sender_id: user.id,
        content,
        message_type: 'text',
        image_url: null,
        image_mime_type: null,
        image_size_bytes: null,
        client_message_id: clientMessageId,
        created_at: new Date().toISOString(),
        is_read: false,
        pending: true,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: mergeMessages(prev[chatId] ?? [], optimistic),
      }));
      touchChat(chatId, optimistic);

      try {
        const saved = await api.sendMessage(
          chatId,
          { content, client_message_id: clientMessageId },
          token,
        );
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: mergeMessages(prev[chatId] ?? [], saved),
        }));
        touchChat(chatId, saved);
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: markMessageFailed(
            prev[chatId] ?? [],
            clientMessageId,
            failureText(error, 'Не удалось отправить сообщение'),
          ),
        }));
      }
    },
    [token, user.id, onUnauthorized, touchChat],
  );

  const sendImage = useCallback(
    async (file: File, rawCaption: string) => {
      const chatId = activeChatIdRef.current;
      if (!chatId) {
        return;
      }
      const caption = rawCaption.trim();
      const clientMessageId = createUuid();
      const previewUrl = URL.createObjectURL(file);
      const optimistic: ChatMessage = {
        id: clientMessageId,
        chat_id: chatId,
        sender_id: user.id,
        content: caption,
        message_type: 'image',
        image_url: null,
        image_mime_type: file.type || null,
        image_size_bytes: file.size,
        client_message_id: clientMessageId,
        created_at: new Date().toISOString(),
        is_read: false,
        pending: true,
        uploadFile: file,
        previewUrl,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: mergeMessages(prev[chatId] ?? [], optimistic),
      }));
      touchChat(chatId, optimistic);

      try {
        const saved = await api.sendImage(
          chatId,
          { file, caption, client_message_id: clientMessageId },
          token,
        );
        URL.revokeObjectURL(previewUrl);
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: mergeMessages(prev[chatId] ?? [], saved),
        }));
        touchChat(chatId, saved);
      } catch (error) {
        if (isUnauthorized(error)) {
          URL.revokeObjectURL(previewUrl);
          onUnauthorized();
          return;
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: markMessageFailed(
            prev[chatId] ?? [],
            clientMessageId,
            failureText(error, 'Не удалось отправить изображение'),
          ),
        }));
      }
    },
    [token, user.id, onUnauthorized, touchChat],
  );

  const retryMessage = useCallback(
    async (message: ChatMessage) => {
      if (!message.client_message_id) {
        return;
      }
      const chatId = message.chat_id;
      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: markMessagePending(prev[chatId] ?? [], message.id),
      }));
      try {
        const saved =
          message.message_type === 'image' && message.uploadFile
            ? await api.sendImage(
                chatId,
                {
                  file: message.uploadFile,
                  caption: message.content,
                  client_message_id: message.client_message_id,
                },
                token,
              )
            : await api.sendMessage(
                chatId,
                { content: message.content, client_message_id: message.client_message_id },
                token,
              );
        if (message.previewUrl) {
          URL.revokeObjectURL(message.previewUrl);
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: mergeMessages(prev[chatId] ?? [], saved),
        }));
        touchChat(chatId, saved);
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: markMessageFailed(
            prev[chatId] ?? [],
            message.id,
            failureText(error, 'Не удалось отправить сообщение'),
          ),
        }));
      }
    },
    [token, onUnauthorized, touchChat],
  );

  const startChat = useCallback(
    async (participant: User) => {
      const chat = await api.createChat(participant.id, token);
      setChats((prev) => {
        const exists = prev.some((item) => item.id === chat.id);
        const merged = exists
          ? prev.map((item) => (item.id === chat.id ? chat : item))
          : [chat, ...prev];
        return merged.sort(byActivity);
      });
      setChatsError(null);
      selectChat(chat.id);
    },
    [token, selectChat],
  );

  const handleSocketEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case 'new_message': {
          const message = event.data;
          const isActive = activeChatIdRef.current === message.chat_id;
          const isMine = message.sender_id === user.id;

          if (!isMine) {
            setOnline((prev) =>
              prev[message.sender_id] ? prev : { ...prev, [message.sender_id]: true },
            );
          }

          setMessagesByChat((prev) => ({
            ...prev,
            [message.chat_id]: mergeMessages(prev[message.chat_id] ?? [], message),
          }));

          setChats((prev) => {
            if (!prev.some((chat) => chat.id === message.chat_id)) {
              void refreshChats();
              return prev;
            }
            const next = prev.map((chat) =>
              chat.id === message.chat_id
                ? {
                    ...chat,
                    last_message: message,
                    last_activity: message.created_at,
                    unread_count: isMine || isActive ? 0 : chat.unread_count + 1,
                  }
                : chat,
            );
            return next.sort(byActivity);
          });

          if (isActive && !isMine) {
            api
              .markChatRead(message.chat_id, token)
              .then(() => {
                setMessagesByChat((prev) => ({
                  ...prev,
                  [message.chat_id]: (prev[message.chat_id] ?? []).map((item) =>
                    item.sender_id !== user.id ? { ...item, is_read: true } : item,
                  ),
                }));
              })
              .catch(() => undefined);
          }

          const hideTimer = typingHideTimers.current[message.chat_id];
          if (hideTimer) {
            clearTimeout(hideTimer);
            typingHideTimers.current[message.chat_id] = undefined;
          }
          setTyping((prev) => ({ ...prev, [message.chat_id]: false }));
          break;
        }
        case 'user_status': {
          const { user_id: userId, status } = event.data;
          setOnline((prev) => ({ ...prev, [userId]: status === 'online' }));
          if (status === 'offline') {
            void refreshChats();
          }
          break;
        }
        case 'typing': {
          const { chat_id: chatId, user_id: userId, is_typing: isTyping } = event.data;
          if (userId === user.id) {
            return;
          }
          if (isTyping) {
            setOnline((prev) => (prev[userId] ? prev : { ...prev, [userId]: true }));
          }
          setTyping((prev) => ({ ...prev, [chatId]: isTyping }));
          const existing = typingHideTimers.current[chatId];
          if (existing) {
            clearTimeout(existing);
          }
          if (isTyping) {
            typingHideTimers.current[chatId] = setTimeout(() => {
              setTyping((prev) => ({ ...prev, [chatId]: false }));
            }, TYPING_HIDE);
          }
          break;
        }
        case 'error':
          console.warn('WebSocket error:', event.data.detail);
          break;
        default:
          break;
      }
    },
    [refreshChats, token, user.id],
  );

  const { status: connection, send: sendSocket } = useRealtime({
    token,
    onEvent: handleSocketEvent,
    onReject: onUnauthorized,
  });

  useEffect(() => {
    if (connection !== 'online') {
      return;
    }
    if (!connectedOnce.current) {
      connectedOnce.current = true;
      return;
    }
    void refreshChats();
    const chatId = activeChatIdRef.current;
    if (chatId) {
      api
        .getMessages(chatId, token, { limit: PAGE_SIZE })
        .then((page) => {
          setMessagesByChat((prev) => ({
            ...prev,
            [chatId]: mergeMessages(prev[chatId] ?? [], [...page.items].reverse()),
          }));
        })
        .catch(() => undefined);
    }
  }, [connection, refreshChats, token]);

  const notifyTyping = useCallback(() => {
    const chatId = activeChatIdRef.current;
    if (!chatId) {
      return;
    }
    const now = Date.now();
    if (now - (typingSentAt.current[chatId] ?? 0) > TYPING_THROTTLE) {
      typingSentAt.current[chatId] = now;
      sendSocket({ type: 'typing', data: { chat_id: chatId, is_typing: true } });
    }
    clearTimeout(typingStopTimers.current[chatId]);
    typingStopTimers.current[chatId] = setTimeout(() => {
      typingSentAt.current[chatId] = 0;
      sendSocket({ type: 'typing', data: { chat_id: chatId, is_typing: false } });
    }, TYPING_RESET);
  }, [sendSocket]);

  useEffect(() => {
    return () => {
      Object.values(typingStopTimers.current).forEach(clearTimeout);
      Object.values(typingHideTimers.current).forEach(clearTimeout);
    };
  }, []);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;

  return {
    chats,
    chatsLoading,
    chatsError,
    activeChat,
    activeChatId,
    messages: activeChatId ? (messagesByChat[activeChatId] ?? []) : [],
    messagesLoading: Boolean(activeChatId && loadingChats[activeChatId]),
    messagesError: activeChatId ? (messagesError[activeChatId] ?? null) : null,
    hasMoreMessages: Boolean(activeChatId && cursors[activeChatId]),
    connection,
    online,
    typing,
    selectChat,
    closeChat,
    startChat,
    sendMessage,
    sendImage,
    retryMessage,
    loadOlder,
    reload,
    notifyTyping,
    refreshChats,
  };
}
