import type { Message } from '../api/types';
import { parseDate } from './format';

export interface ChatMessage extends Message {
  pending?: boolean;
  failed?: boolean;
}

export function byCreatedAt(a: Message, b: Message): number {
  const diff = parseDate(a.created_at).getTime() - parseDate(b.created_at).getTime();
  if (diff !== 0) {
    return diff;
  }
  return a.id.localeCompare(b.id);
}

export function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort(byCreatedAt);
}

export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage | ChatMessage[],
): ChatMessage[] {
  const incomingList = Array.isArray(incoming) ? incoming : [incoming];
  const next = [...current];

  for (const message of incomingList) {
    const byId = next.findIndex((item) => item.id === message.id);
    const byClient = message.client_message_id
      ? next.findIndex(
          (item) =>
            item.client_message_id === message.client_message_id &&
            item.sender_id === message.sender_id,
        )
      : -1;
    const index = byId !== -1 ? byId : byClient;

    if (index !== -1) {
      next[index] = { ...next[index], ...message, pending: false, failed: false };
    } else {
      next.push(message);
    }
  }

  return sortMessages(next);
}

export function markMessageFailed(list: ChatMessage[], id: string): ChatMessage[] {
  return list.map((item) => (item.id === id ? { ...item, pending: false, failed: true } : item));
}

export function markMessagePending(list: ChatMessage[], id: string): ChatMessage[] {
  return list.map((item) => (item.id === id ? { ...item, pending: true, failed: false } : item));
}

export function removeMessage(list: ChatMessage[], id: string): ChatMessage[] {
  return list.filter((item) => item.id !== id);
}
