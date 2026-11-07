import { useState } from 'react';
import { resolveMediaUrl } from '../api/client';
import type { User } from '../api/types';
import { formatTime } from '../lib/format';
import type { ChatMessage } from '../lib/messages';
import { AudioPlayer } from './AudioPlayer';
import { Avatar } from './Avatar';
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from './Icons';
import { ImageLightbox } from './ImageLightbox';
import { VideoNote } from './VideoNote';

interface MessageBubbleProps {
  message: ChatMessage;
  sender: User;
  isOwn: boolean;
  showAvatar: boolean;
  showAuthor?: boolean;
  grouped: boolean;
  onRetry: (message: ChatMessage) => void;
}

export function MessageBubble({
  message,
  sender,
  isOwn,
  showAvatar,
  showAuthor = false,
  grouped,
  onRetry,
}: MessageBubbleProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = message.message_type === 'image';
  const isAudio = message.message_type === 'audio';
  const isVideoNote = message.message_type === 'video_note';
  const imageSrc = message.previewUrl ?? resolveMediaUrl(message.image_url);
  const mediaSrc = message.previewUrl ?? resolveMediaUrl(message.media_url);
  const imageAlt = message.content || 'Изображение';
  const bubbleModifier = isImage
    ? ' message__bubble--image'
    : isAudio
      ? ' message__bubble--audio'
      : isVideoNote
        ? ' message__bubble--video-note'
        : '';

  return (
    <div
      className={[
        'message',
        isOwn ? 'message--own' : 'message--other',
        grouped ? 'message--grouped' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!isOwn ? (
        <div className="message__avatar">
          {showAvatar ? <Avatar user={sender} size={32} /> : null}
        </div>
      ) : null}

      <div className={`message__bubble${bubbleModifier}`}>
        {showAuthor && !isOwn && !grouped ? (
          <span className="message__author">{sender.display_name}</span>
        ) : null}

        {isImage ? (
          imageSrc ? (
            <button
              type="button"
              className="message__image-button"
              onClick={() => setLightboxOpen(true)}
              aria-label="Открыть изображение"
            >
              <img
                className="message__image"
                src={imageSrc}
                alt={imageAlt}
                loading="lazy"
                draggable={false}
              />
              {message.pending ? (
                <span className="message__image-overlay" aria-hidden="true">
                  <span className="spinner spinner--small" />
                </span>
              ) : null}
            </button>
          ) : (
            <div className="message__image-placeholder">Изображение недоступно</div>
          )
        ) : null}

        {isAudio ? (
          mediaSrc ? (
            <AudioPlayer src={mediaSrc} durationSeconds={message.media_duration_seconds} />
          ) : (
            <div className="message__media-placeholder">Аудио недоступно</div>
          )
        ) : null}

        {isVideoNote ? (
          mediaSrc ? (
            <VideoNote
              src={mediaSrc}
              durationSeconds={message.media_duration_seconds}
              pending={message.pending}
            />
          ) : (
            <div className="message__media-placeholder">Видеокружок недоступен</div>
          )
        ) : null}

        {message.content ? <div className="message__content">{message.content}</div> : null}

        <div className="message__meta">
          <span className="message__time">{formatTime(message.created_at)}</span>
          {isOwn ? (
            message.failed ? (
              <button
                type="button"
                className="message__retry"
                onClick={() => onRetry(message)}
                title={message.errorText ?? 'Повторить отправку'}
              >
                <AlertIcon width={14} height={14} />
                Повторить
              </button>
            ) : message.pending ? (
              <ClockIcon width={14} height={14} className="message__status" />
            ) : message.is_read ? (
              <DoubleCheckIcon width={15} height={15} className="message__status is-read" />
            ) : (
              <CheckIcon width={15} height={15} className="message__status" />
            )
          ) : null}
        </div>

        {message.failed && message.errorText ? (
          <div className="message__error" role="alert">
            {message.errorText}
          </div>
        ) : null}
      </div>

      {lightboxOpen && imageSrc ? (
        <ImageLightbox
          src={imageSrc}
          alt={imageAlt}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}
