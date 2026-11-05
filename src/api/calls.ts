import { ApiError } from './client';

const CALLS_ORIGIN = (import.meta.env.VITE_CALLS_URL ?? '').replace(/\/+$/, '');
const SAME_ORIGIN_HTTP_PREFIX = '/calls-api';
const SAME_ORIGIN_WS_PREFIX = '/calls-ws';
const API_PREFIX = '/api/v1';

export type CallMedia = 'audio' | 'video';
export type CallDirection = 'incoming' | 'outgoing';

export interface CallUser {
  id: string;
  username: string | null;
  display_name: string | null;
}

export interface CallRecord {
  id: string;
  caller: CallUser;
  callee: CallUser;
  media: CallMedia;
  state: 'ringing' | 'active' | 'ended';
  status: string;
  end_reason: string | null;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
}

export interface CallConfig {
  ice_servers: RTCIceServer[];
  ring_timeout_seconds: number;
  disconnect_grace_seconds: number;
  max_call_duration_seconds: number;
  media: CallMedia[];
}

export interface CallReadyData {
  user?: CallUser;
  call: CallRecord | null;
  ring_timeout_seconds?: number;
  disconnect_grace_seconds?: number;
  media?: CallMedia[];
}

export type CallServerEvent =
  | { type: 'ready'; data: CallReadyData }
  | {
      type:
        | 'call.ringing'
        | 'call.incoming'
        | 'call.accepted'
        | 'call.rejected'
        | 'call.cancelled'
        | 'call.ended';
      data: { call: CallRecord };
    }
  | {
      type: 'webrtc.offer' | 'webrtc.answer';
      data: { call_id: string; from_user_id: string; sdp: string };
    }
  | {
      type: 'webrtc.ice';
      data: {
        call_id: string;
        from_user_id: string;
        candidate: RTCIceCandidateInit | null;
      };
    }
  | {
      type: 'presence.state';
      data: { user_id: string; online: boolean; in_call: boolean };
    }
  | { type: 'error'; data: { code: string; detail: string } }
  | { type: 'pong' };

interface WsTicketResponse {
  ticket: string;
  expires_in: number;
}

function apiBase(): string {
  if (CALLS_ORIGIN) {
    return `${CALLS_ORIGIN}${API_PREFIX}`;
  }
  return `${SAME_ORIGIN_HTTP_PREFIX}${API_PREFIX}`;
}

async function request<T>(path: string, token: string, method: 'GET' | 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(
      0,
      'Сервис звонков недоступен. Проверьте, запущен ли xam_call_service.',
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : `Ошибка сервиса звонков (${response.status})`;
    throw new ApiError(response.status, detail);
  }

  return data as T;
}

export function getCallConfig(token: string): Promise<CallConfig> {
  return request<CallConfig>('/calls/config', token, 'GET');
}

export function createCallWsTicket(token: string): Promise<WsTicketResponse> {
  return request<WsTicketResponse>('/calls/ws-ticket', token, 'POST');
}

export function buildCallWebSocketUrl(ticket: string): string {
  const encodedTicket = encodeURIComponent(ticket);
  if (CALLS_ORIGIN) {
    const base = CALLS_ORIGIN.replace(/^http/i, 'ws');
    return `${base}/ws/calls?ticket=${encodedTicket}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${SAME_ORIGIN_WS_PREFIX}/ws/calls?ticket=${encodedTicket}`;
}

export function parseCallServerEvent(raw: string): CallServerEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    return parsed as CallServerEvent;
  } catch {
    return null;
  }
}
