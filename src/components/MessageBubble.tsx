import type { User } from '../api/types';
import { formatTime } from '../lib/format';
import type { ChatMessage } from '../lib/messages';
import { Avatar } from './Avatar';
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from './Icons';

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

      <div className="message__bubble">
        <div className="message__content">{message.content}</div>
        <div className="message__meta">
          <span className="message__time">{formatTime(message.created_at)}</span>
          {isOwn ? (
            message.failed ? (
              <button
                type="button"
                className="message__retry"
                onClick={() => onRetry(message)}
                title="Повторить отправку"
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
      </div>
    </div>
  );
}
