import { useState } from 'react';
import { resolveMediaUrl } from '../api/client';
import type { User } from '../api/types';
import { formatTime } from '../lib/format';
import type { ChatMessage } from '../lib/messages';
import { Avatar } from './Avatar';
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from './Icons';
import { ImageLightbox } from './ImageLightbox';

interface MessageBubbleProps {
  message: ChatMessage;
  partner: User;
  isOwn: boolean;
  showAvatar: boolean;
  grouped: boolean;
  onRetry: (message: ChatMessage) => void;
}

export function MessageBubble({
  message,
  partner,
  isOwn,
  showAvatar,
  grouped,
  onRetry,
}: MessageBubbleProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = message.message_type === 'image';
  const imageSrc = message.previewUrl ?? resolveMediaUrl(message.image_url);
  const imageAlt = message.content || 'Изображение';

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
          {showAvatar ? <Avatar user={partner} size={32} /> : null}
        </div>
      ) : null}

      <div className={`message__bubble${isImage ? ' message__bubble--image' : ''}`}>
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
