import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { formatDuration } from '../lib/media';
import { PauseIcon, PlayIcon } from './Icons';

interface AudioPlayerProps {
  src: string;
  durationSeconds: number | null;
}

export function AudioPlayer({ src, durationSeconds }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(durationSeconds ?? 0);
    setFailed(false);
  }, [src, durationSeconds]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const next = event.currentTarget.valueAsNumber;
    audio.currentTime = next;
    setCurrent(next);
  };

  if (failed) {
    return <div className="message__media-placeholder">Аудио недоступно</div>;
  }

  return (
    <div className="audio-player">
      <button
        type="button"
        className="audio-player__toggle"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Воспроизвести аудиосообщение'}
      >
        {playing ? <PauseIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}
      </button>
      <div className="audio-player__body">
        <input
          className="audio-player__progress"
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(current, Math.max(duration, 0.1))}
          onChange={handleSeek}
          aria-label="Позиция воспроизведения"
        />
        <span className="audio-player__time">
          {formatDuration(current)} / {formatDuration(duration)}
        </span>
      </div>
      <audio
        ref={audioRef}
        className="audio-player__element"
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) {
            setDuration(value);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
          }
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
