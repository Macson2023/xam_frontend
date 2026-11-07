import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/client';
import { ApiError } from '../api/client';
import type {
  Chat,
  ChatDetail,
  ConnectionStatus,
  CreateChannelPayload,
  CreateCommunityPayload,
  Message,
  ServerEvent,
  UpdateChannelPayload,
  User,
} from '../api/types';
import { canPost, canRead, needsSubscription } from '../lib/chat';
import type { MediaKind } from '../lib/media';
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

export interface ActiveCommunityUpdate {
  title: string;
  description: string | null;
  avatar_url: string | null;
  is_public?: boolean;
}

export interface MessengerState {
  chats: Chat[];
  chatsLoading: boolean;
  chatsError: string | null;
  activeChat: Chat | null;
  activeChatId: string | null;
  activeDetail: ChatDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  canSendActive: boolean;
  needsSubscribeActive: boolean;
  subscribeBusy: boolean;
  subscribeError: string | null;
  messages: ChatMessage[];
  messagesLoading: boolean;
  messagesError: string | null;
  hasMoreMessages: boolean;
  connection: ConnectionStatus;
  online: Record<string, boolean>;
  typing: Record<string, boolean>;
  typingUserIds: Record<string, string[]>;
  selectChat: (chatId: string) => void;
  closeChat: () => void;
  startChat: (participant: User) => Promise<void>;
  openChannelById: (channelId: string) => Promise<void>;
  createGroup: (payload: CreateCommunityPayload) => Promise<Chat>;
  createChannel: (payload: CreateChannelPayload) => Promise<Chat>;
  sendMessage: (content: string) => Promise<void>;
  sendImage: (file: File, caption: string) => Promise<void>;
  sendAudio: (file: File, durationSeconds: number) => Promise<void>;
  sendVideoNote: (file: File, durationSeconds: number) => Promise<void>;
  retryMessage: (message: ChatMessage) => Promise<void>;
  loadOlder: () => Promise<void>;
  reload: () => Promise<void>;
  notifyTyping: () => void;
  refreshChats: () => Promise<void>;
  refreshActiveDetail: () => Promise<void>;
  updateActiveCommunity: (payload: ActiveCommunityUpdate) => Promise<void>;
  addActiveMembers: (users: User[], role: 'admin' | 'member') => Promise<void>;
  updateActiveMemberRole: (userId: string, role: 'admin' | 'member') => Promise<void>;
  removeActiveMember: (userId: string) => Promise<void>;
  leaveActiveCommunity: () => Promise<void>;
  deleteActiveCommunity: () => Promise<void>;
  subscribeActiveChannel: () => Promise<void>;
}

function byActivity(a: Chat, b: Chat): number {
  return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
}

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort(byActivity);
}

function mergeChat(list: Chat[], chat: Chat): Chat[] {
  const exists = list.some((item) => item.id === chat.id);
  const merged = exists
    ? list.map((item) => (item.id === chat.id ? { ...item, ...chat } : item))
    : [chat, ...list];
  return sortChats(merged);
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function failureText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Недостаточно прав для этого действия.';
    }
    if (error.status === 404) {
      return 'Чат не найден или вы не участник.';
    }
    if (error.status === 400) {
      return error.message || fallback;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function detailErrorText(error: unknown, chat: Chat): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return chat.type === 'group'
        ? 'Группа не найдена или вы не участник.'
        : 'Канал не найден или он приватный.';
    }
    if (error.status === 403) {
      return 'Нет доступа к этому чату.';
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Не удалось загрузить информацию о чате.';
}

function messageErrorText(error: unknown, chat: Chat): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return chat.type === 'channel'
        ? 'Читать канал могут только подписчики.'
        : 'Нет доступа к сообщениям.';
    }
    if (error.status === 404) {
      return 'Чат не найден или вы не участник.';
    }
  }
  return error instanceof Error && error.message ? error.message : 'Не удалось загрузить сообщения';
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
  const [activeOverride, setActiveOverride] = useState<Chat | null>(null);
  const [details, setDetails] = useState<Record<string, ChatDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string | null>>({});
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({});
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [loadedChats, setLoadedChats] = useState<Record<string, boolean>>({});
  const [loadingChats, setLoadingChats] = useState<Record<string, boolean>>({});
  const [messagesErrors, setMessagesErrors] = useState<Record<string, string | null>>({});
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [typingUserIds, setTypingUserIds] = useState<Record<string, string[]>>({});

  const activeChatIdRef = useRef<string | null>(null);
  const chatsRef = useRef<Chat[]>([]);
  const detailsRef = useRef<Record<string, ChatDetail>>({});
  const activeOverrideRef = useRef<Chat | null>(null);
  const typingSentAt = useRef<Record<string, number>>({});
  const typingStopTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingHideTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const connectedOnce = useRef(false);

  chatsRef.current = chats;
  detailsRef.current = details;
  activeOverrideRef.current = activeOverride;

  const resolveChat = useCallback((chatId: string | null): Chat | null => {
    if (!chatId) {
      return null;
    }
    return (
      detailsRef.current[chatId] ??
      chatsRef.current.find((chat) => chat.id === chatId) ??
      (activeOverrideRef.current?.id === chatId ? activeOverrideRef.current : null)
    );
  }, []);

  const applyDetail = useCallback((detail: ChatDetail) => {
    setDetails((prev) => ({ ...prev, [detail.id]: detail }));
    setChats((prev) => {
      const exists = prev.some((chat) => chat.id === detail.id);
      if (!exists && detail.my_role === null) {
        return prev;
      }
      return exists
        ? sortChats(prev.map((chat) => (chat.id === detail.id ? { ...chat, ...detail } : chat)))
        : sortChats([detail, ...prev]);
    });
    setActiveOverride((prev) => (prev?.id === detail.id ? detail : prev));
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

  const loadDetail = useCallback(
    async (chat: Chat) => {
      if (chat.type === 'direct') {
        return;
      }
      setDetailLoading((prev) => ({ ...prev, [chat.id]: true }));
      setDetailErrors((prev) => ({ ...prev, [chat.id]: null }));
      try {
        const detail = await api.getChatDetail(chat.type, chat.id, token);
        applyDetail(detail);
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setDetailErrors((prev) => ({ ...prev, [chat.id]: detailErrorText(error, chat) }));
        if (error instanceof ApiError && error.status === 404) {
          void refreshChats();
        }
      } finally {
        setDetailLoading((prev) => ({ ...prev, [chat.id]: false }));
      }
    },
    [token, onUnauthorized, applyDetail, refreshChats],
  );

  const loadMessages = useCallback(
    async (chat: Chat, before?: string) => {
      if (!canRead(chat)) {
        setLoadedChats((prev) => ({ ...prev, [chat.id]: true }));
        return;
      }
      setLoadingChats((prev) => ({ ...prev, [chat.id]: true }));
      setMessagesErrors((prev) => ({ ...prev, [chat.id]: null }));
      try {
        const page = await api.getMessages(chat.type, chat.id, token, {
          limit: PAGE_SIZE,
          before: before ?? null,
        });
        const chronological = [...page.items].reverse();
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: mergeMessages(prev[chat.id] ?? [], chronological),
        }));
        setCursors((prev) => ({ ...prev, [chat.id]: page.next_cursor }));
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setMessagesErrors((prev) => ({ ...prev, [chat.id]: messageErrorText(error, chat) }));
      } finally {
        setLoadingChats((prev) => ({ ...prev, [chat.id]: false }));
        setLoadedChats((prev) => ({ ...prev, [chat.id]: true }));
      }
    },
    [token, onUnauthorized],
  );

  const selectChat = useCallback(
    (chatId: string) => {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setSubscribeError(null);
      setDetailErrors((prev) => (prev[chatId] ? { ...prev, [chatId]: null } : prev));
      setActiveOverride((prev) => (prev && prev.id !== chatId ? null : prev));
      setChats((prev) =>
        prev.map((chat) => (chat.id === chatId ? { ...chat, unread_count: 0 } : chat)),
      );
      const chat = resolveChat(chatId);
      if (chat && canRead(chat)) {
        api
          .markChatRead(chat.type, chat.id, token)
          .then(() => {
            setChats((prev) =>
              prev.map((item) => (item.id === chatId ? { ...item, unread_count: 0 } : item)),
            );
          })
          .catch((error: unknown) => {
            if (isUnauthorized(error)) {
              onUnauthorized();
            }
          });
      }
    },
    [token, onUnauthorized, resolveChat],
  );

  const closeChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setActiveOverride(null);
  }, []);

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

  const activeChat = useMemo(() => {
    if (!activeChatId) {
      return null;
    }
    return (
      chats.find((chat) => chat.id === activeChatId) ??
      (activeOverride?.id === activeChatId ? activeOverride : null) ??
      details[activeChatId] ??
      null
    );
  }, [activeChatId, chats, activeOverride, details]);

  const activeDetail = activeChatId ? (details[activeChatId] ?? null) : null;

  useEffect(() => {
    if (activeChatId || chats.length === 0) {
      return;
    }
    if (window.matchMedia('(min-width: 900px)').matches) {
      selectChat(chats[0].id);
    }
  }, [chats, activeChatId, selectChat]);

  useEffect(() => {
    if (!activeChatId || activeChat || chatsLoading) {
      return;
    }
    if (activeOverride?.id === activeChatId) {
      return;
    }
    activeChatIdRef.current = null;
    setActiveChatId(null);
  }, [activeChatId, activeChat, chatsLoading, activeOverride]);

  useEffect(() => {
    if (!activeChat || activeChat.type === 'direct') {
      return;
    }
    if (
      details[activeChat.id] ||
      detailLoading[activeChat.id] ||
      detailErrors[activeChat.id]
    ) {
      return;
    }
    void loadDetail(activeChat);
  }, [activeChat, details, detailLoading, detailErrors, loadDetail]);

  useEffect(() => {
    if (!activeChat) {
      return;
    }
    if (loadedChats[activeChat.id] || loadingChats[activeChat.id]) {
      return;
    }
    void loadMessages(activeChat);
  }, [activeChat, loadedChats, loadingChats, loadMessages]);

  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      const chat = resolveChat(activeChatIdRef.current);
      if (!chat || !canRead(chat)) {
        return;
      }
      setChats((prev) =>
        prev.map((item) => (item.id === chat.id ? { ...item, unread_count: 0 } : item)),
      );
      api.markChatRead(chat.type, chat.id, token).catch((error: unknown) => {
        if (isUnauthorized(error)) {
          onUnauthorized();
        }
      });
      void refreshChats();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [resolveChat, token, onUnauthorized, refreshChats]);

  const reload = useCallback(async () => {
    const chat = resolveChat(activeChatIdRef.current);
    if (!chat) {
      return;
    }
    if (chat.type !== 'direct') {
      setDetailErrors((prev) => (prev[chat.id] ? { ...prev, [chat.id]: null } : prev));
      await loadDetail(chat);
    }
    await loadMessages(chat);
  }, [loadMessages, loadDetail, resolveChat]);

  const loadOlder = useCallback(async () => {
    const chat = resolveChat(activeChatIdRef.current);
    if (!chat) {
      return;
    }
    const cursor = cursors[chat.id];
    if (!cursor || loadingChats[chat.id]) {
      return;
    }
    await loadMessages(chat, cursor);
  }, [cursors, loadingChats, loadMessages, resolveChat]);

  const touchChat = useCallback((chatId: string, message: Message) => {
    setChats((prev) =>
      sortChats(
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                last_message: message,
                last_activity: message.created_at,
              }
            : chat,
        ),
      ),
    );
  }, []);

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const chat = resolveChat(activeChatIdRef.current);
      const content = rawContent.trim();
      if (!chat || !content || !canPost(chat)) {
        return;
      }

      const clientMessageId = createUuid();
      const optimistic: ChatMessage = {
        id: clientMessageId,
        chat_id: chat.id,
        sender_id: user.id,
        content,
        message_type: 'text',
        image_url: null,
        image_mime_type: null,
        image_size_bytes: null,
        media_url: null,
        media_mime_type: null,
        media_size_bytes: null,
        media_duration_seconds: null,
        client_message_id: clientMessageId,
        created_at: new Date().toISOString(),
        is_read: false,
        pending: true,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chat.id]: mergeMessages(prev[chat.id] ?? [], optimistic),
      }));
      touchChat(chat.id, optimistic);

      try {
        const saved = await api.sendMessage(
          chat.type,
          chat.id,
          { content, client_message_id: clientMessageId },
          token,
        );
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: mergeMessages(prev[chat.id] ?? [], saved),
        }));
        touchChat(chat.id, saved);
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: markMessageFailed(
            prev[chat.id] ?? [],
            clientMessageId,
            failureText(error, 'Не удалось отправить сообщение'),
          ),
        }));
      }
    },
    [token, user.id, onUnauthorized, touchChat, resolveChat],
  );

  const sendImage = useCallback(
    async (file: File, rawCaption: string) => {
      const chat = resolveChat(activeChatIdRef.current);
      if (!chat || !canPost(chat)) {
        return;
      }
      const caption = rawCaption.trim();
      const clientMessageId = createUuid();
      const previewUrl = URL.createObjectURL(file);
      const optimistic: ChatMessage = {
        id: clientMessageId,
        chat_id: chat.id,
        sender_id: user.id,
        content: caption,
        message_type: 'image',
        image_url: null,
        image_mime_type: file.type || null,
        image_size_bytes: file.size,
        media_url: null,
        media_mime_type: null,
        media_size_bytes: null,
        media_duration_seconds: null,
        client_message_id: clientMessageId,
        created_at: new Date().toISOString(),
        is_read: false,
        pending: true,
        uploadFile: file,
        previewUrl,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chat.id]: mergeMessages(prev[chat.id] ?? [], optimistic),
      }));
      touchChat(chat.id, optimistic);

      try {
        const saved = await api.sendImage(
          chat.type,
          chat.id,
          { file, caption, client_message_id: clientMessageId },
          token,
        );
        URL.revokeObjectURL(previewUrl);
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: mergeMessages(prev[chat.id] ?? [], saved),
        }));
        touchChat(chat.id, saved);
      } catch (error) {
        if (isUnauthorized(error)) {
          URL.revokeObjectURL(previewUrl);
          onUnauthorized();
          return;
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: markMessageFailed(
            prev[chat.id] ?? [],
            clientMessageId,
            failureText(error, 'Не удалось отправить изображение'),
          ),
        }));
      }
    },
    [token, user.id, onUnauthorized, touchChat, resolveChat],
  );

  const sendMedia = useCallback(
    async (kind: MediaKind, file: File, durationSeconds: number) => {
      const chat = resolveChat(activeChatIdRef.current);
      if (!chat || !canPost(chat)) {
        return;
      }
      const clientMessageId = createUuid();
      const previewUrl = URL.createObjectURL(file);
      const optimistic: ChatMessage = {
        id: clientMessageId,
        chat_id: chat.id,
        sender_id: user.id,
        content: '',
        message_type: kind,
        image_url: null,
        image_mime_type: null,
        image_size_bytes: null,
        media_url: null,
        media_mime_type: file.type || null,
        media_size_bytes: file.size,
        media_duration_seconds: durationSeconds,
        client_message_id: clientMessageId,
        created_at: new Date().toISOString(),
        is_read: false,
        pending: true,
        uploadFile: file,
        previewUrl,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chat.id]: mergeMessages(prev[chat.id] ?? [], optimistic),
      }));
      touchChat(chat.id, optimistic);

      try {
        const saved =
          kind === 'audio'
            ? await api.sendAudio(
                chat.type,
                chat.id,
                { file, durationSeconds, client_message_id: clientMessageId },
                token,
              )
            : await api.sendVideoNote(
                chat.type,
                chat.id,
                { file, durationSeconds, client_message_id: clientMessageId },
                token,
              );
        URL.revokeObjectURL(previewUrl);
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: mergeMessages(prev[chat.id] ?? [], saved),
        }));
        touchChat(chat.id, saved);
      } catch (error) {
        if (isUnauthorized(error)) {
          URL.revokeObjectURL(previewUrl);
          onUnauthorized();
          return;
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: markMessageFailed(
            prev[chat.id] ?? [],
            clientMessageId,
            failureText(
              error,
              kind === 'audio'
                ? 'Не удалось отправить аудиосообщение'
                : 'Не удалось отправить видеокружок',
            ),
          ),
        }));
      }
    },
    [token, user.id, onUnauthorized, touchChat, resolveChat],
  );

  const sendAudio = useCallback(
    (file: File, durationSeconds: number) => sendMedia('audio', file, durationSeconds),
    [sendMedia],
  );

  const sendVideoNote = useCallback(
    (file: File, durationSeconds: number) => sendMedia('video_note', file, durationSeconds),
    [sendMedia],
  );

  const retryMessage = useCallback(
    async (message: ChatMessage) => {
      if (!message.client_message_id) {
        return;
      }
      const chat = resolveChat(message.chat_id);
      if (!chat || !canPost(chat)) {
        return;
      }
      setMessagesByChat((prev) => ({
        ...prev,
        [chat.id]: markMessagePending(prev[chat.id] ?? [], message.id),
      }));
      try {
        const mediaDuration = message.media_duration_seconds ?? 1;
        let saved: Message;
        if (
          (message.message_type === 'audio' || message.message_type === 'video_note') &&
          message.uploadFile
        ) {
          saved =
            message.message_type === 'audio'
              ? await api.sendAudio(
                  chat.type,
                  chat.id,
                  {
                    file: message.uploadFile,
                    durationSeconds: mediaDuration,
                    client_message_id: message.client_message_id,
                  },
                  token,
                )
              : await api.sendVideoNote(
                  chat.type,
                  chat.id,
                  {
                    file: message.uploadFile,
                    durationSeconds: mediaDuration,
                    client_message_id: message.client_message_id,
                  },
                  token,
                );
        } else if (message.message_type === 'image' && message.uploadFile) {
          saved = await api.sendImage(
            chat.type,
            chat.id,
            {
              file: message.uploadFile,
              caption: message.content,
              client_message_id: message.client_message_id,
            },
            token,
          );
        } else {
          saved = await api.sendMessage(
            chat.type,
            chat.id,
            { content: message.content, client_message_id: message.client_message_id },
            token,
          );
        }
        if (message.previewUrl) {
          URL.revokeObjectURL(message.previewUrl);
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: mergeMessages(prev[chat.id] ?? [], saved),
        }));
        touchChat(chat.id, saved);
      } catch (error) {
        if (isUnauthorized(error)) {
          onUnauthorized();
          return;
        }
        setMessagesByChat((prev) => ({
          ...prev,
          [chat.id]: markMessageFailed(
            prev[chat.id] ?? [],
            message.id,
            failureText(error, 'Не удалось отправить сообщение'),
          ),
        }));
      }
    },
    [token, onUnauthorized, touchChat, resolveChat],
  );

  const startChat = useCallback(
    async (participant: User) => {
      const chat = await api.createChat(participant.id, token);
      setChats((prev) => mergeChat(prev, chat));
      setChatsError(null);
      selectChat(chat.id);
    },
    [token, selectChat],
  );

  const openCreatedChat = useCallback((chat: Chat) => {
    setChats((prev) => mergeChat(prev, chat));
    setActiveOverride(null);
    activeChatIdRef.current = chat.id;
    setActiveChatId(chat.id);
    setSubscribeError(null);
  }, []);

  const createGroup = useCallback(
    async (payload: CreateCommunityPayload) => {
      const chat = await api.createGroup(payload, token);
      openCreatedChat(chat);
      return chat;
    },
    [token, openCreatedChat],
  );

  const createChannel = useCallback(
    async (payload: CreateChannelPayload) => {
      const chat = await api.createChannel(payload, token);
      openCreatedChat(chat);
      return chat;
    },
    [token, openCreatedChat],
  );

  const openChannelById = useCallback(
    async (channelId: string) => {
      const detail = await api.getChannel(channelId, token);
      applyDetail(detail);
      setActiveOverride(detail);
      activeChatIdRef.current = detail.id;
      setActiveChatId(detail.id);
      setSubscribeError(null);
      if (canRead(detail)) {
        void api
          .markChatRead('channel', detail.id, token)
          .then(() => {
            setChats((prev) =>
              prev.map((chat) =>
                chat.id === detail.id ? { ...chat, unread_count: 0 } : chat,
              ),
            );
          })
          .catch((error: unknown) => {
            if (isUnauthorized(error)) {
              onUnauthorized();
            }
          });
      }
    },
    [token, applyDetail, onUnauthorized],
  );

  const handleSocketEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case 'new_message': {
          const message = event.data;
          const isActive = activeChatIdRef.current === message.chat_id;
          const isMine = message.sender_id === user.id;
          const chat = resolveChat(message.chat_id);

          if (!isMine) {
            setOnline((prev) =>
              prev[message.sender_id] ? prev : { ...prev, [message.sender_id]: true },
            );
          }

          setMessagesByChat((prev) => ({
            ...prev,
            [message.chat_id]: mergeMessages(prev[message.chat_id] ?? [], message),
          }));

          const chatExists = chatsRef.current.some(
            (item) => item.id === message.chat_id,
          );
          setChats((prev) => {
            if (!prev.some((item) => item.id === message.chat_id)) {
              return prev;
            }
            return sortChats(
              prev.map((item) =>
                item.id === message.chat_id
                  ? {
                      ...item,
                      last_message: message,
                      last_activity: message.created_at,
                      unread_count: isMine || isActive ? 0 : item.unread_count + 1,
                    }
                  : item,
              ),
            );
          });
          if (!chatExists) {
            void refreshChats();
          }

          if (isActive && !isMine && chat && canRead(chat)) {
            api
              .markChatRead(chat.type, chat.id, token)
              .then(() => {
                setMessagesByChat((prev) => ({
                  ...prev,
                  [message.chat_id]: (prev[message.chat_id] ?? []).map((item) =>
                    item.sender_id !== user.id ? { ...item, is_read: true } : item,
                  ),
                }));
              })
              .catch((error: unknown) => {
                if (isUnauthorized(error)) {
                  onUnauthorized();
                }
              });
          }

          for (const key of Object.keys(typingHideTimers.current)) {
            if (key.startsWith(`${message.chat_id}:`)) {
              clearTimeout(typingHideTimers.current[key]);
              delete typingHideTimers.current[key];
            }
          }
          setTypingUserIds((prev) => ({ ...prev, [message.chat_id]: [] }));
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
          const key = `${chatId}:${userId}`;
          const timer = typingHideTimers.current[key];
          if (timer) {
            clearTimeout(timer);
          }
          if (isTyping) {
            setOnline((prev) => (prev[userId] ? prev : { ...prev, [userId]: true }));
            setTypingUserIds((prev) => {
              const current = prev[chatId] ?? [];
              return current.includes(userId)
                ? prev
                : { ...prev, [chatId]: [...current, userId] };
            });
            typingHideTimers.current[key] = setTimeout(() => {
              setTypingUserIds((prev) => ({
                ...prev,
                [chatId]: (prev[chatId] ?? []).filter((id) => id !== userId),
              }));
              delete typingHideTimers.current[key];
            }, TYPING_HIDE);
          } else {
            setTypingUserIds((prev) => ({
              ...prev,
              [chatId]: (prev[chatId] ?? []).filter((id) => id !== userId),
            }));
            delete typingHideTimers.current[key];
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
    [refreshChats, token, user.id, onUnauthorized, resolveChat],
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
    const chat = resolveChat(activeChatIdRef.current);
    if (!chat) {
      return;
    }
    if (chat.type !== 'direct') {
      void loadDetail(chat);
    }
    if (canRead(chat)) {
      api
        .getMessages(chat.type, chat.id, token, { limit: PAGE_SIZE })
        .then((page) => {
          setMessagesByChat((prev) => ({
            ...prev,
            [chat.id]: mergeMessages(prev[chat.id] ?? [], [...page.items].reverse()),
          }));
        })
        .catch(() => undefined);
    }
  }, [connection, refreshChats, token, resolveChat, loadDetail]);

  const notifyTyping = useCallback(() => {
    const chat = resolveChat(activeChatIdRef.current);
    if (!chat || !canPost(chat)) {
      return;
    }
    const chatId = chat.id;
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
  }, [sendSocket, resolveChat]);

  useEffect(() => {
    return () => {
      Object.values(typingStopTimers.current).forEach(clearTimeout);
      Object.values(typingHideTimers.current).forEach(clearTimeout);
    };
  }, []);

  const refreshActiveDetail = useCallback(async () => {
    const chat = resolveChat(activeChatIdRef.current);
    if (!chat || chat.type === 'direct') {
      return;
    }
    await loadDetail(chat);
  }, [loadDetail, resolveChat]);

  const requireActiveCommunity = useCallback((): Chat & { type: 'group' | 'channel' } => {
    const chat = resolveChat(activeChatIdRef.current);
    if (!chat || chat.type === 'direct') {
      throw new Error('Действие доступно только для группы или канала.');
    }
    return chat as Chat & { type: 'group' | 'channel' };
  }, [resolveChat]);

  const updateActiveCommunity = useCallback(
    async (payload: ActiveCommunityUpdate) => {
      const chat = requireActiveCommunity();
      const body: UpdateChannelPayload =
        chat.type === 'channel'
          ? payload
          : {
              title: payload.title,
              description: payload.description,
              avatar_url: payload.avatar_url,
            };
      const updated = await api.updateCommunity(chat.type, chat.id, body, token);
      setChats((prev) => mergeChat(prev, updated));
      const detail = await api.getChatDetail(chat.type, chat.id, token);
      applyDetail(detail);
      await refreshChats();
    },
    [requireActiveCommunity, token, applyDetail, refreshChats],
  );

  const addActiveMembers = useCallback(
    async (users: User[], role: 'admin' | 'member') => {
      const chat = requireActiveCommunity();
      const detail = await api.addCommunityMembers(
        chat.type,
        chat.id,
        { user_ids: users.map((item) => item.id), role },
        token,
      );
      applyDetail(detail);
      await refreshChats();
    },
    [requireActiveCommunity, token, applyDetail, refreshChats],
  );

  const updateActiveMemberRole = useCallback(
    async (userId: string, role: 'admin' | 'member') => {
      const chat = requireActiveCommunity();
      const detail = await api.updateCommunityMemberRole(
        chat.type,
        chat.id,
        userId,
        role,
        token,
      );
      applyDetail(detail);
      await refreshChats();
    },
    [requireActiveCommunity, token, applyDetail, refreshChats],
  );

  const removeActiveMember = useCallback(
    async (userId: string) => {
      const chat = requireActiveCommunity();
      await api.removeCommunityMember(chat.type, chat.id, userId, token);
      const detail = await api.getChatDetail(chat.type, chat.id, token);
      applyDetail(detail);
      await refreshChats();
    },
    [requireActiveCommunity, token, applyDetail, refreshChats],
  );

  const leaveActiveCommunity = useCallback(async () => {
    const chat = requireActiveCommunity();
    await api.leaveCommunity(chat.type, chat.id, token);
    setChats((prev) => prev.filter((item) => item.id !== chat.id));
    setDetails((prev) => {
      const next = { ...prev };
      delete next[chat.id];
      return next;
    });
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setActiveOverride(null);
    await refreshChats();
  }, [requireActiveCommunity, token, refreshChats]);

  const deleteActiveCommunity = useCallback(async () => {
    const chat = requireActiveCommunity();
    await api.deleteCommunity(chat.type, chat.id, token);
    setChats((prev) => prev.filter((item) => item.id !== chat.id));
    setDetails((prev) => {
      const next = { ...prev };
      delete next[chat.id];
      return next;
    });
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setActiveOverride(null);
    await refreshChats();
  }, [requireActiveCommunity, token, refreshChats]);

  const subscribeActiveChannel = useCallback(async () => {
    const chat = resolveChat(activeChatIdRef.current);
    if (!chat || chat.type !== 'channel') {
      return;
    }
    setSubscribeBusy(true);
    setSubscribeError(null);
    try {
      const detail = await api.subscribeChannel(chat.id, token);
      applyDetail(detail);
      setLoadedChats((prev) => ({ ...prev, [chat.id]: false }));
      setCursors((prev) => ({ ...prev, [chat.id]: null }));
      await loadMessages(detail);
      await refreshChats();
      void api
        .markChatRead('channel', detail.id, token)
        .then(() => {
          setChats((prev) =>
            prev.map((item) => (item.id === detail.id ? { ...item, unread_count: 0 } : item)),
          );
        })
        .catch(() => undefined);
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setSubscribeError('Канал приватный — подписка доступна только по приглашению.');
      } else if (error instanceof ApiError && error.status === 404) {
        setSubscribeError('Канал не найден.');
      } else {
        setSubscribeError(
          error instanceof Error ? error.message : 'Не удалось подписаться на канал.',
        );
      }
    } finally {
      setSubscribeBusy(false);
    }
  }, [resolveChat, token, applyDetail, loadMessages, refreshChats, onUnauthorized]);

  const typing = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const [chatId, ids] of Object.entries(typingUserIds)) {
      result[chatId] = ids.length > 0;
    }
    return result;
  }, [typingUserIds]);

  const canSendActive = activeChat ? canPost(activeChat) : false;
  const needsSubscribeActive = activeChat ? needsSubscription(activeChat) : false;

  return {
    chats,
    chatsLoading,
    chatsError,
    activeChat,
    activeChatId,
    activeDetail,
    detailLoading: Boolean(activeChatId && detailLoading[activeChatId]),
    detailError: activeChatId ? (detailErrors[activeChatId] ?? null) : null,
    canSendActive,
    needsSubscribeActive,
    subscribeBusy,
    subscribeError,
    messages: activeChatId ? (messagesByChat[activeChatId] ?? []) : [],
    messagesLoading: Boolean(activeChatId && loadingChats[activeChatId]),
    messagesError: activeChatId ? (messagesErrors[activeChatId] ?? null) : null,
    hasMoreMessages: Boolean(activeChatId && cursors[activeChatId]),
    connection,
    online,
    typing,
    typingUserIds,
    selectChat,
    closeChat,
    startChat,
    openChannelById,
    createGroup,
    createChannel,
    sendMessage,
    sendImage,
    sendAudio,
    sendVideoNote,
    retryMessage,
    loadOlder,
    reload,
    notifyTyping,
    refreshChats,
    refreshActiveDetail,
    updateActiveCommunity,
    addActiveMembers,
    updateActiveMemberRole,
    removeActiveMember,
    leaveActiveCommunity,
    deleteActiveCommunity,
    subscribeActiveChannel,
  };
}
