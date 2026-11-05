import { useCallback, useEffect, useRef, useState } from 'react';
import * as callsApi from '../api/calls';
import type {
  CallConfig,
  CallDirection,
  CallMedia,
  CallRecord,
  CallServerEvent,
  CallUser,
} from '../api/calls';
import { ApiError } from '../api/client';
import type { User } from '../api/types';

const PING_INTERVAL = 25_000;
const MAX_RECONNECT_DELAY = 15_000;

const ERROR_TEXT: Record<string, string> = {
  user_offline: 'Пользователь не в сети.',
  callee_busy: 'Пользователь уже участвует в звонке.',
  caller_busy: 'Вы уже участвуете в звонке.',
  self_call: 'Нельзя позвонить самому себе.',
  call_not_found: 'Звонок не найден.',
  invalid_state: 'Состояние звонка уже изменилось.',
  rate_limited: 'Слишком много событий. Попробуйте чуть позже.',
  unavailable: 'Сервис звонков временно недоступен.',
  forbidden: 'Нет прав для этого действия.',
  invalid_payload: 'Некорректные данные сигналинга.',
};

const ABORT_ERRORS = new Set([
  'user_offline',
  'callee_busy',
  'caller_busy',
  'self_call',
  'call_not_found',
  'invalid_state',
  'unavailable',
  'forbidden',
  'invalid_payload',
  'rate_limited',
]);

const END_REASON_TEXT: Record<string, string> = {
  rejected: 'Собеседник отклонил звонок.',
  cancelled: 'Звонок отменён.',
  timeout: 'Собеседник не ответил.',
  hangup: 'Звонок завершён.',
  disconnected: 'Связь потеряна.',
  max_duration: 'Достигнута максимальная длительность звонка.',
  server_shutdown: 'Сервер завершил звонок.',
};

export type CallsConnection = 'connecting' | 'online' | 'offline';
export type CallPhase = 'preparing' | 'ringing' | 'incoming' | 'connecting' | 'active';

export interface CallSession {
  id: string | null;
  peer: CallUser;
  media: CallMedia;
  direction: CallDirection;
  phase: CallPhase;
  answeredAt: string | null;
}

export interface CallsState {
  connection: CallsConnection;
  session: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  elapsed: number;
  error: string | null;
  startCall: (peer: CallUser, media: CallMedia) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  clearError: () => void;
}

function mediaErrorText(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Доступ к камере или микрофону запрещён. Разрешите его в настройках браузера.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Камера или микрофон не найдены.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Камера или микрофон заняты другим приложением.';
    case 'OverconstrainedError':
      return 'Не удалось подобрать подходящие параметры камеры или микрофона.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Не удалось получить доступ к камере или микрофону.';
  }
}

function describeError(code: string, detail: string): string {
  return ERROR_TEXT[code] ?? detail ?? 'Ошибка сервиса звонков.';
}

export function useCalls(token: string, me: User, onUnauthorized: () => void): CallsState {
  const [connection, setConnection] = useState<CallsConnection>('connecting');
  const [session, setSession] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setErrorState] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const meRef = useRef<CallUser>(me);
  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteTracksRef = useRef<MediaStreamTrack[]>([]);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: ['stun:stun.l.google.com:19302'] }]);
  const configPromiseRef = useRef<Promise<CallConfig> | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const mediaRequestRef = useRef(0);
  const eventQueueRef = useRef<Promise<void>>(Promise.resolve());

  meRef.current = me;

  const setError = useCallback((message: string | null) => {
    if (mountedRef.current) {
      setErrorState(message);
    }
  }, []);

  const applySession = useCallback((next: CallSession | null) => {
    sessionRef.current = next;
    if (mountedRef.current) {
      setSession(next);
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (mountedRef.current) {
      setLocalStream(null);
      setMuted(false);
      setCameraEnabled(false);
    }
  }, []);

  const closePeer = useCallback(() => {
    const pc = pcRef.current;
    pcRef.current = null;
    pendingCandidatesRef.current = [];
    localCandidatesRef.current = [];
    remoteTracksRef.current = [];
    if (pc) {
      pc.onicecandidate = null;
      pc.onicecandidateerror = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        // The connection may already be closed by the browser.
      }
    }
    if (mountedRef.current) {
      setRemoteStream(null);
    }
  }, []);

  const resetCall = useCallback(() => {
    mediaRequestRef.current += 1;
    closePeer();
    stopLocalStream();
    applySession(null);
  }, [applySession, closePeer, stopLocalStream]);

  const ensureLocalMedia = useCallback(
    async (media: CallMedia, requestId: number): Promise<MediaStream> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Браузер не поддерживает WebRTC. Откройте приложение по HTTPS или на localhost.',
        );
      }

      const previous = localStreamRef.current;
      if (previous) {
        previous.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      if (mountedRef.current) {
        setLocalStream(null);
        setMuted(false);
        setCameraEnabled(false);
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          media === 'video'
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, max: 30 },
                facingMode: 'user',
              }
            : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (mediaRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException('Media request cancelled', 'AbortError');
      }

      localStreamRef.current = stream;
      if (mountedRef.current) {
        setLocalStream(stream);
        setMuted(false);
        setCameraEnabled(stream.getVideoTracks().length > 0);
      }
      return stream;
    },
    [],
  );

  const sendEvent = useCallback((payload: Record<string, unknown>): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadConfig = useCallback(async (): Promise<CallConfig | null> => {
    if (!configPromiseRef.current) {
      configPromiseRef.current = callsApi
        .getCallConfig(token)
        .then((config) => {
          if (Array.isArray(config.ice_servers) && config.ice_servers.length > 0) {
            iceServersRef.current = config.ice_servers;
          }
          return config;
        })
        .catch((caught: unknown) => {
          configPromiseRef.current = null;
          throw caught;
        });
    }
    return configPromiseRef.current;
  }, [token]);

  const createPeer = useCallback(
    async (callId: string): Promise<RTCPeerConnection | null> => {
      if (pcRef.current) {
        return pcRef.current;
      }
      if (typeof RTCPeerConnection === 'undefined') {
        setError('Браузер не поддерживает WebRTC.');
        return null;
      }

      try {
        await loadConfig();
      } catch {
        // Fall back to the default STUN server when the config endpoint fails.
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      pcRef.current = pc;
      pendingCandidatesRef.current = [];
      localCandidatesRef.current = [];
      remoteTracksRef.current = [];

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }
        const candidate = event.candidate.toJSON();
        localCandidatesRef.current.push(candidate);
        if (localCandidatesRef.current.length > 300) {
          localCandidatesRef.current.shift();
        }
        sendEvent({ type: 'webrtc.ice', data: { call_id: callId, candidate } });
      };

      pc.ontrack = (event) => {
        if (!mountedRef.current) {
          return;
        }
        const existing = remoteTracksRef.current;
        if (!existing.includes(event.track)) {
          remoteTracksRef.current = [...existing, event.track];
        }
        setRemoteStream(new MediaStream(remoteTracksRef.current));
      };

      return pc;
    },
    [loadConfig, sendEvent, setError],
  );

  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // A stale candidate from a previous negotiation can be ignored safely.
      }
    }
  }, []);

  const maybeCreateOffer = useCallback(
    async (call: CallRecord) => {
      const pc = pcRef.current;
      if (!pc || pc.signalingState !== 'stable' || pc.localDescription) {
        return;
      }
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: call.media === 'video',
        });
        await pc.setLocalDescription(offer);
        const sdp = offer.sdp ?? '';
        if (sdp) {
          sendEvent({ type: 'webrtc.offer', data: { call_id: call.id, sdp } });
        }
      } catch {
        setError('Не удалось создать WebRTC-предложение.');
      }
    },
    [sendEvent, setError],
  );

  const handleOffer = useCallback(
    async (callId: string, sdp: string) => {
      const current = sessionRef.current;
      if (!current || current.id !== callId) {
        return;
      }
      const pc = await createPeer(callId);
      if (!pc) {
        return;
      }
      try {
        if (pc.signalingState !== 'stable') {
          return;
        }
        await pc.setRemoteDescription({ type: 'offer', sdp });
        await flushCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const localSdp = pc.localDescription?.sdp;
        if (localSdp) {
          sendEvent({ type: 'webrtc.answer', data: { call_id: callId, sdp: localSdp } });
        }
      } catch {
        setError('Не удалось принять WebRTC-предложение.');
      }
    },
    [createPeer, flushCandidates, sendEvent, setError],
  );

  const handleAnswer = useCallback(
    async (callId: string, sdp: string) => {
      const current = sessionRef.current;
      if (!current || current.id !== callId) {
        return;
      }
      const pc = pcRef.current;
      if (!pc) {
        return;
      }
      try {
        if (pc.signalingState !== 'have-local-offer') {
          return;
        }
        await pc.setRemoteDescription({ type: 'answer', sdp });
        await flushCandidates(pc);
      } catch {
        setError('Не удалось применить WebRTC-ответ.');
      }
    },
    [flushCandidates, setError],
  );

  const handleRemoteIce = useCallback(
    async (callId: string, candidate: RTCIceCandidateInit | null) => {
      const current = sessionRef.current;
      if (!current || current.id !== callId || !candidate) {
        return;
      }
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ICE candidates can arrive after the peer connection was closed.
      }
    },
    [],
  );

  const resendLocalSignaling = useCallback(
    (callId: string) => {
      const pc = pcRef.current;
      if (!pc) {
        return;
      }
      const description = pc.localDescription;
      if (description?.sdp) {
        sendEvent({
          type: description.type === 'offer' ? 'webrtc.offer' : 'webrtc.answer',
          data: { call_id: callId, sdp: description.sdp },
        });
      }
      localCandidatesRef.current.forEach((candidate) => {
        sendEvent({ type: 'webrtc.ice', data: { call_id: callId, candidate } });
      });
    },
    [sendEvent],
  );

  const handleReady = useCallback(
    async (data: callsApi.CallReadyData) => {
      if (data.user) {
        meRef.current = { ...meRef.current, ...data.user };
      }

      const call = data.call;
      if (!call) {
        if (sessionRef.current) {
          resetCall();
          setError('Звонок завершён.');
        }
        return;
      }

      const myId = meRef.current?.id;
      const direction: CallDirection = myId && call.caller.id === myId ? 'outgoing' : 'incoming';
      const peer = direction === 'outgoing' ? call.callee : call.caller;

      if (call.state === 'ringing') {
        if (direction === 'incoming') {
          applySession({
            id: call.id,
            peer,
            media: call.media,
            direction,
            phase: 'incoming',
            answeredAt: null,
          });
        } else if (localStreamRef.current) {
          applySession({
            id: call.id,
            peer,
            media: call.media,
            direction,
            phase: 'ringing',
            answeredAt: null,
          });
        } else {
          sendEvent({ type: 'call.cancel', data: { call_id: call.id } });
          resetCall();
          setError('Предыдущий звонок отменён.');
        }
        return;
      }

      if (call.state === 'active') {
        if (!localStreamRef.current) {
          sendEvent({ type: 'call.hangup', data: { call_id: call.id } });
          resetCall();
          setError('Активный звонок не удалось восстановить. Позвоните заново.');
          return;
        }
        applySession({
          id: call.id,
          peer,
          media: call.media,
          direction,
          phase: 'active',
          answeredAt: call.answered_at,
        });
        if (!pcRef.current) {
          await createPeer(call.id);
        }
        if (direction === 'outgoing') {
          await maybeCreateOffer(call);
        }
        resendLocalSignaling(call.id);
      }
    },
    [
      applySession,
      createPeer,
      maybeCreateOffer,
      resetCall,
      resendLocalSignaling,
      sendEvent,
      setError,
    ],
  );

  const handleCallEvent = useCallback(
    async (event: CallServerEvent) => {
      switch (event.type) {
        case 'ready':
          await handleReady(event.data);
          return;

        case 'pong':
        case 'presence.state':
          return;

        case 'error': {
          const message = describeError(event.data.code, event.data.detail);
          setError(message);
          const current = sessionRef.current;
          if (
            current &&
            ABORT_ERRORS.has(event.data.code) &&
            (current.phase === 'preparing' ||
              current.phase === 'ringing' ||
              current.phase === 'connecting')
          ) {
            resetCall();
          }
          return;
        }

        case 'call.ringing': {
          const call = event.data.call;
          const current = sessionRef.current;
          if (current?.id && current.id !== call.id) {
            return;
          }
          if (current?.id === call.id && current.phase !== 'preparing') {
            return;
          }
          if (!localStreamRef.current) {
            sendEvent({ type: 'call.cancel', data: { call_id: call.id } });
            resetCall();
            setError('Не удалось начать звонок: нет доступа к микрофону.');
            return;
          }
          applySession({
            id: call.id,
            peer: call.callee,
            media: call.media,
            direction: 'outgoing',
            phase: 'ringing',
            answeredAt: null,
          });
          return;
        }

        case 'call.incoming': {
          const call = event.data.call;
          const current = sessionRef.current;
          if (current && current.id !== call.id) {
            sendEvent({ type: 'call.reject', data: { call_id: call.id } });
            return;
          }
          if (current?.id === call.id) {
            return;
          }
          setError(null);
          applySession({
            id: call.id,
            peer: call.caller,
            media: call.media,
            direction: 'incoming',
            phase: 'incoming',
            answeredAt: null,
          });
          return;
        }

        case 'call.accepted': {
          const call = event.data.call;
          const accepted = sessionRef.current;
          if (!accepted || accepted.id !== call.id) {
            return;
          }
          const direction: CallDirection =
            meRef.current?.id === call.caller.id ? 'outgoing' : 'incoming';
          const peer = direction === 'outgoing' ? call.callee : call.caller;
          applySession({
            id: call.id,
            peer,
            media: call.media,
            direction,
            phase: 'active',
            answeredAt: call.answered_at ?? new Date().toISOString(),
          });

          if (!pcRef.current) {
            try {
              if (!localStreamRef.current) {
                const requestId = mediaRequestRef.current + 1;
                mediaRequestRef.current = requestId;
                await ensureLocalMedia(call.media, requestId);
              }
              await createPeer(call.id);
            } catch (caught) {
              if (sessionRef.current?.id === call.id) {
                sendEvent({ type: 'call.hangup', data: { call_id: call.id } });
                resetCall();
                if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
                  setError(mediaErrorText(caught));
                }
              }
              return;
            }
          }

          if (direction === 'outgoing') {
            await maybeCreateOffer(call);
          }
          return;
        }

        case 'call.rejected': {
          const call = event.data.call;
          if (sessionRef.current) {
            resetCall();
            setError(END_REASON_TEXT[call.end_reason ?? 'rejected'] ?? 'Собеседник отклонил звонок.');
          }
          return;
        }

        case 'call.cancelled': {
          const call = event.data.call;
          if (sessionRef.current) {
            resetCall();
            setError(END_REASON_TEXT[call.end_reason ?? 'cancelled'] ?? 'Звонок отменён.');
          }
          return;
        }

        case 'call.ended': {
          const call = event.data.call;
          const current = sessionRef.current;
          if (current) {
            const reason = call.end_reason ?? 'hangup';
            const message =
              current.direction === 'incoming' &&
              (reason === 'timeout' || reason === 'cancelled')
                ? 'Пропущенный звонок.'
                : END_REASON_TEXT[reason] ?? 'Звонок завершён.';
            resetCall();
            setError(message);
          }
          return;
        }

        case 'webrtc.offer':
          await handleOffer(event.data.call_id, event.data.sdp);
          return;

        case 'webrtc.answer':
          await handleAnswer(event.data.call_id, event.data.sdp);
          return;

        case 'webrtc.ice':
          await handleRemoteIce(event.data.call_id, event.data.candidate);
          return;
      }
    },
    [
      applySession,
      createPeer,
      ensureLocalMedia,
      handleAnswer,
      handleOffer,
      handleReady,
      handleRemoteIce,
      maybeCreateOffer,
      resetCall,
      sendEvent,
      setError,
    ],
  );

  const handleServerEventRef = useRef(handleCallEvent);
  handleServerEventRef.current = handleCallEvent;

  const startCall = useCallback(
    async (peer: CallUser, media: CallMedia) => {
      if (sessionRef.current) {
        setError('Уже есть активный звонок.');
        return;
      }
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError('Нет соединения с сервисом звонков.');
        return;
      }
      if (meRef.current && peer.id === meRef.current.id) {
        setError('Нельзя позвонить самому себе.');
        return;
      }

      setError(null);
      const requestId = mediaRequestRef.current + 1;
      mediaRequestRef.current = requestId;
      applySession({
        id: null,
        peer,
        media,
        direction: 'outgoing',
        phase: 'preparing',
        answeredAt: null,
      });

      try {
        await ensureLocalMedia(media, requestId);
      } catch (caught) {
        if (mediaRequestRef.current === requestId) {
          resetCall();
          if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
            setError(mediaErrorText(caught));
          }
        }
        return;
      }

      if (mediaRequestRef.current !== requestId || !sessionRef.current) {
        return;
      }

      try {
        await loadConfig();
      } catch {
        // The default STUN server is enough when the config request fails.
      }

      if (!sendEvent({ type: 'call.invite', data: { to_user_id: peer.id, media } })) {
        resetCall();
        setError('Не удалось отправить приглашение в звонок.');
      }
    },
    [applySession, ensureLocalMedia, loadConfig, resetCall, sendEvent, setError],
  );

  const acceptCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.direction !== 'incoming' || current.phase !== 'incoming' || !current.id) {
      return;
    }
    const callId = current.id;
    const requestId = mediaRequestRef.current + 1;
    mediaRequestRef.current = requestId;
    setError(null);
    applySession({ ...current, phase: 'connecting' });

    try {
      await ensureLocalMedia(current.media, requestId);
    } catch (caught) {
      if (mediaRequestRef.current === requestId) {
        sendEvent({ type: 'call.reject', data: { call_id: callId } });
        resetCall();
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setError(mediaErrorText(caught));
        }
      }
      return;
    }

    if (mediaRequestRef.current !== requestId) {
      return;
    }
    const latest = sessionRef.current;
    if (!latest || latest.id !== callId) {
      return;
    }

    const pc = await createPeer(callId);
    if (!pc) {
      sendEvent({ type: 'call.reject', data: { call_id: callId } });
      resetCall();
      return;
    }

    if (!sendEvent({ type: 'call.accept', data: { call_id: callId } })) {
      resetCall();
      setError('Не удалось принять звонок.');
      return;
    }
    applySession({ ...latest, phase: 'connecting' });
  }, [applySession, createPeer, ensureLocalMedia, resetCall, sendEvent, setError]);

  const rejectCall = useCallback(() => {
    const current = sessionRef.current;
    if (current?.id) {
      sendEvent({ type: 'call.reject', data: { call_id: current.id } });
    }
    resetCall();
  }, [resetCall, sendEvent]);

  const hangup = useCallback(() => {
    const current = sessionRef.current;
    if (!current?.id) {
      resetCall();
      return;
    }
    if (current.direction === 'incoming' && current.phase === 'incoming') {
      sendEvent({ type: 'call.reject', data: { call_id: current.id } });
    } else if (current.direction === 'outgoing' && current.phase === 'ringing') {
      sendEvent({ type: 'call.cancel', data: { call_id: current.id } });
    } else {
      sendEvent({ type: 'call.hangup', data: { call_id: current.id } });
    }
    resetCall();
  }, [resetCall, sendEvent]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const track = stream.getAudioTracks()[0];
    if (!track) {
      return;
    }
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      return;
    }
    const nextEnabled = !tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setCameraEnabled(nextEnabled);
  }, []);

  const clearError = useCallback(() => setError(null), [setError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    let fetchingTicket = false;

    const stopPing = () => {
      if (pingTimer !== undefined) {
        clearInterval(pingTimer);
        pingTimer = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) {
        return;
      }
      setConnection('offline');
      const delay = Math.min(1_000 * 2 ** attempts, MAX_RECONNECT_DELAY);
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed || fetchingTicket) {
        return;
      }
      fetchingTicket = true;
      setConnection('connecting');

      try {
        const { ticket } = await callsApi.createCallWsTicket(token);
        if (disposed) {
          return;
        }

        let socket: WebSocket;
        try {
          socket = new WebSocket(callsApi.buildCallWebSocketUrl(ticket));
        } catch {
          scheduleReconnect();
          return;
        }
        socketRef.current = socket;

        socket.onopen = () => {
          if (disposed) {
            socket.close();
            return;
          }
          attempts = 0;
          setConnection('online');
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
          const event = callsApi.parseCallServerEvent(message.data);
          if (!event) {
            return;
          }
          eventQueueRef.current = eventQueueRef.current
            .then(() => handleServerEventRef.current(event))
            .catch(() => undefined);
        };

        socket.onclose = () => {
          stopPing();
          if (socketRef.current === socket) {
            socketRef.current = null;
          }
          if (disposed) {
            return;
          }
          scheduleReconnect();
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch (caught) {
        if (disposed) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          setConnection('offline');
          onUnauthorized();
          return;
        }
        scheduleReconnect();
      } finally {
        fetchingTicket = false;
      }
    };

    void connect();

    return () => {
      disposed = true;
      stopPing();
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.close();
      }
    };
  }, [token, onUnauthorized]);

  useEffect(() => {
    const phase = session?.phase;
    const answeredAt = session?.answeredAt ?? null;
    if (phase !== 'active' || !answeredAt) {
      setElapsed(0);
      return;
    }
    const parsed = Date.parse(answeredAt);
    const startedAt = Number.isFinite(parsed) ? parsed : Date.now();
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [session?.phase, session?.answeredAt]);

  useEffect(() => {
    return () => {
      mediaRequestRef.current += 1;
      closePeer();
      const stream = localStreamRef.current;
      localStreamRef.current = null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [closePeer]);

  return {
    connection,
    session,
    localStream,
    remoteStream,
    muted,
    cameraEnabled,
    elapsed,
    error,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
    clearError,
  };
}
