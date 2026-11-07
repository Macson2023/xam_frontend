import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../lib/media';
import { PlayIcon, VolumeIcon, VolumeOffIcon } from './Icons';

interface VideoNoteProps {
  src: string;
  durationSeconds: number | null;
  pending?: boolean;
}

export function VideoNote({ src, durationSeconds, pending = false }: VideoNoteProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(durationSeconds ?? 0);
    setFailed(false);
  }, [src, durationSeconds]);

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => setFailed(true));
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const next = !muted;
    video.muted = next;
    setMuted(next);
  };

  if (failed) {
    return <div className="message__media-placeholder">Видеокружок недоступен</div>;
  }

  return (
    <div className="video-note">
      <button
        type="button"
        className="video-note__media"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Воспроизвести видеокружок'}
      >
        <video
          ref={videoRef}
          className="video-note__video"
          src={src}
          preload="metadata"
          playsInline
          muted={muted}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            const total = Number.isFinite(element.duration) ? element.duration : duration;
            setProgress(total > 0 ? element.currentTime / total : 0);
          }}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) {
              setDuration(value);
            }
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            if (videoRef.current) {
              videoRef.current.currentTime = 0;
            }
          }}
          onError={() => setFailed(true)}
        />
        {!playing ? (
          <span className="video-note__overlay" aria-hidden="true">
            <PlayIcon width={26} height={26} />
          </span>
        ) : null}
        {pending ? (
          <span className="video-note__overlay video-note__overlay--pending" aria-hidden="true">
            <span className="spinner spinner--small" />
          </span>
        ) : null}
      </button>
      <div className="video-note__bar">
        <span className="video-note__progress" aria-hidden="true">
          <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </span>
        <span className="video-note__duration">{formatDuration(duration)}</span>
        <button
          type="button"
          className="video-note__mute"
          onClick={toggleMute}
          aria-label={muted ? 'Включить звук' : 'Выключить звук'}
          title={muted ? 'Включить звук' : 'Выключить звук'}
        >
          {muted ? <VolumeOffIcon width={15} height={15} /> : <VolumeIcon width={15} height={15} />}
        </button>
      </div>
    </div>
  );
}
