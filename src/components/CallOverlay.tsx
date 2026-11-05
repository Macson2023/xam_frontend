import { useEffect, useRef } from 'react';
import type { CallUser } from '../api/calls';
import type { User } from '../api/types';
import type { CallSession } from '../hooks/useCalls';
import { Avatar } from './Avatar';
import {
  CloseIcon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  VideoIcon,
  VideoOffIcon,
} from './Icons';

interface CallOverlayProps {
  session: CallSession;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  elapsed: number;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onDismissError: () => void;
}

function toAvatarUser(user: CallUser): User {
  const username = user.username ?? '';
  return {
    id: user.id,
    username,
    display_name: user.display_name || username || 'Собеседник',
    avatar_url: null,
    created_at: '',
    last_seen: null,
  };
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
}

function statusText(session: CallSession, elapsed: number): string {
  switch (session.phase) {
    case 'preparing':
      return 'Готовим звонок…';
    case 'ringing':
      return 'Звоним…';
    case 'incoming':
      return 'Входящий звонок';
    case 'connecting':
      return 'Соединяемся…';
    case 'active':
      return formatElapsed(elapsed);
  }
}

export function CallOverlay({
  session,
  localStream,
  remoteStream,
  muted,
  cameraEnabled,
  elapsed,
  error,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
  onToggleCamera,
  onDismissError,
}: CallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = localVideoRef.current;
    if (!element) {
      return;
    }
    if (element.srcObject !== localStream) {
      element.srcObject = localStream;
    }
    if (localStream) {
      void element.play().catch(() => undefined);
    }
  }, [localStream]);

  useEffect(() => {
    const element = remoteVideoRef.current;
    if (!element) {
      return;
    }
    if (element.srcObject !== remoteStream) {
      element.srcObject = remoteStream;
    }
    if (remoteStream) {
      void element.play().catch(() => undefined);
    }
  }, [remoteStream]);

  const peerUser = toAvatarUser(session.peer);
  const peerName = peerUser.display_name;
  const isVideo = session.media === 'video';
  const isIncoming = session.direction === 'incoming' && session.phase === 'incoming';
  const canControlMedia = session.phase !== 'incoming' && localStream !== null;
  const remoteHasVideo = Boolean(
    remoteStream && remoteStream.getVideoTracks().some((track) => track.readyState === 'live'),
  );
  const localHasVideo = Boolean(
    localStream &&
      cameraEnabled &&
      localStream.getVideoTracks().some((track) => track.readyState === 'live'),
  );
  const mediaLabel = isVideo ? 'Видеозвонок' : 'Аудиозвонок';
  const status = statusText(session, elapsed);
  const hangupLabel =
    session.phase === 'active' || session.phase === 'connecting'
      ? 'Завершить звонок'
      : 'Отменить звонок';

  return (
    <div
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${mediaLabel}: ${peerName}`}
    >
      <div className="call-card">
        <header className="call-card__head">
          <Avatar user={peerUser} size={46} />
          <div className="call-card__peer">
            <span className="call-card__name">{peerName}</span>
            <span className="call-card__status">{status}</span>
          </div>
          <span className="call-card__media-type">
            {isVideo ? <VideoIcon width={17} height={17} /> : <PhoneIcon width={17} height={17} />}
            {mediaLabel}
          </span>
        </header>

        <div className={`call-card__stage${isVideo ? '' : ' call-card__stage--audio'}`}>
          {isVideo ? (
            <>
              <video
                ref={remoteVideoRef}
                className={`call-card__remote${remoteHasVideo ? '' : ' is-hidden'}`}
                autoPlay
                playsInline
              />
              {!remoteHasVideo ? (
                <div className="call-card__placeholder">
                  <Avatar user={peerUser} size={92} />
                  <span>Ожидание видео…</span>
                </div>
              ) : null}

              <div className="call-card__local">
                <video
                  ref={localVideoRef}
                  className={`call-card__local-video${localHasVideo ? '' : ' is-hidden'}`}
                  autoPlay
                  playsInline
                  muted
                />
                {!localHasVideo ? (
                  <div className="call-card__local-off">
                    {!localStream || cameraEnabled ? (
                      <span className="spinner" />
                    ) : (
                      <VideoOffIcon width={22} height={22} />
                    )}
                    <span>{!localStream ? 'Подключаем камеру…' : 'Камера выключена'}</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <video ref={remoteVideoRef} className="call-card__audio-sink" autoPlay playsInline />
              <div className="call-card__placeholder call-card__placeholder--audio">
                <Avatar user={peerUser} size={104} />
                <strong>{peerName}</strong>
                <span>{status}</span>
              </div>
            </>
          )}
        </div>

        {error ? (
          <div className="call-card__error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="icon-button"
              onClick={onDismissError}
              aria-label="Закрыть сообщение об ошибке"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
        ) : null}

        <div className="call-card__controls">
          {isIncoming ? (
            <>
              <button
                type="button"
                className="call-button call-button--accept"
                onClick={onAccept}
                title="Принять звонок"
                aria-label="Принять звонок"
              >
                <PhoneIcon width={24} height={24} />
              </button>
              <button
                type="button"
                className="call-button call-button--danger call-button--hangup"
                onClick={onReject}
                title="Отклонить звонок"
                aria-label="Отклонить звонок"
              >
                <PhoneIcon width={24} height={24} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`call-button${muted ? ' call-button--active' : ''}`}
                onClick={onToggleMute}
                disabled={!canControlMedia}
                title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
                aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}
              >
                {muted ? (
                  <MicOffIcon width={22} height={22} />
                ) : (
                  <MicIcon width={22} height={22} />
                )}
              </button>
              {isVideo ? (
                <button
                  type="button"
                  className={`call-button${cameraEnabled ? '' : ' call-button--active'}`}
                  onClick={onToggleCamera}
                  disabled={!canControlMedia}
                  title={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
                  aria-label={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
                >
                  {cameraEnabled ? (
                    <VideoIcon width={22} height={22} />
                  ) : (
                    <VideoOffIcon width={22} height={22} />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="call-button call-button--danger call-button--hangup"
                onClick={onHangup}
                title={hangupLabel}
                aria-label={hangupLabel}
              >
                <PhoneIcon width={24} height={24} />
              </button>
            </>
          )}
        </div>

        {isIncoming ? (
          <p className="call-card__hint">
            {mediaLabel}. Примите звонок, чтобы разрешить доступ к{' '}
            {isVideo ? 'камере и микрофону' : 'микрофону'}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
