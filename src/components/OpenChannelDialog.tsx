import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { Modal } from './Modal';

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface OpenChannelDialogProps {
  onClose: () => void;
  onOpen: (channelId: string) => Promise<void>;
  onUnauthorized: () => void;
}

export function OpenChannelDialog({
  onClose,
  onOpen,
  onUnauthorized,
}: OpenChannelDialogProps) {
  const [channelId, setChannelId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const match = UUID_PATTERN.exec(channelId.trim());
    if (!match) {
      setError('Введите корректный ID канала или ссылку с ID.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onOpen(match[0]);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      if (caught instanceof ApiError && caught.status === 404) {
        setError('Канал не найден или он приватный.');
      } else {
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : 'Не удалось открыть канал.',
        );
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Открыть канал по ID"
      subtitle="Публичный канал можно открыть без подписки, а затем подписаться."
      onClose={onClose}
      closeDisabled={submitting}
      size="small"
      footer={
        <>
          <button
            type="button"
            className="button button--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="submit"
            form="open-channel-form"
            className="button button--primary"
            disabled={submitting || !channelId.trim()}
          >
            {submitting ? <span className="spinner spinner--small" /> : null}
            Открыть
          </button>
        </>
      }
    >
      <form id="open-channel-form" className="dialog-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        <label className="field">
          <span className="field__label">ID канала</span>
          <input
            className="field__input"
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoFocus
            spellCheck={false}
          />
          <span className="field__hint">ID отображается в настройках канала.</span>
        </label>
      </form>
    </Modal>
  );
}
