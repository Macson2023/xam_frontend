import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWebSocketUrl } from '../api/client';
import type { ConnectionStatus, ServerEvent } from '../api/types';

const PING_INTERVAL = 25_000;
const MAX_RECONNECT_DELAY = 15_000;

interface UseRealtimeOptions {
  token: string;
  onEvent: (event: ServerEvent) => void;
  onReject?: () => void;
}

interface UseRealtimeResult {
  status: ConnectionStatus;
  send: (payload: string | Record<string, unknown>) => boolean;
}

function parseEvent(raw: string): ServerEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    return parsed as ServerEvent;
  } catch {
    return null;
  }
}

export function useRealtime({ token, onEvent, onReject }: UseRealtimeOptions): UseRealtimeResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const onRejectRef = useRef(onReject);

  onEventRef.current = onEvent;
  onRejectRef.current = onReject;

  const send = useCallback((payload: string | Record<string, unknown>): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    return true;
  }, []);

  useEffect(() => {
    let closedByUs = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const stopPing = () => {
      if (pingTimer !== undefined) {
        clearInterval(pingTimer);
        pingTimer = undefined;
      }
    };

    const connect = () => {
      if (closedByUs) {
        return;
      }
      const current = socketRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      setStatus(attempts === 0 ? 'connecting' : 'reconnecting');

      let socket: WebSocket;
      try {
        socket = new WebSocket(buildWebSocketUrl(token));
      } catch {
        setStatus('offline');
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setStatus('online');
        stopPing();
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send('ping');
          }
        }, PING_INTERVAL);
      };

      socket.onmessage = (message) => {
        if (typeof message.data !== 'string') {
          return;
        }
        const event = parseEvent(message.data);
        if (event) {
          onEventRef.current(event);
        }
      };

      socket.onclose = (event) => {
        stopPing();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (closedByUs) {
          setStatus('offline');
          return;
        }
        if (event.code === 1008) {
          setStatus('offline');
          onRejectRef.current?.();
          return;
        }
        setStatus('reconnecting');
        const delay = Math.min(1_000 * 2 ** attempts, MAX_RECONNECT_DELAY);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    const handleOnline = () => {
      if (!socketRef.current) {
        if (reconnectTimer !== undefined) {
          clearTimeout(reconnectTimer);
          reconnectTimer = undefined;
        }
        connect();
      }
    };

    connect();
    window.addEventListener('online', handleOnline);

    return () => {
      closedByUs = true;
      stopPing();
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      window.removeEventListener('online', handleOnline);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [token]);

  return { status, send };
}
