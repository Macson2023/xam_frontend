import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { GlobeIcon, LockIcon } from './Icons';
import { Modal } from './Modal';
import { UserMultiSelect } from './UserMultiSelect';

export interface CommunityDraft {
  title: string;
  description: string;
  avatar_url: string;
  is_public: boolean;
  member_ids: string[];
}

interface CreateChatDialogProps {
  kind: 'group' | 'channel';
  token: string;
  currentUser: User;
  onClose: () => void;
  onCreate: (draft: CommunityDraft) => Promise<void>;
  onUnauthorized: () => void;
}

export function CreateChatDialog({
  kind,
  token,
  currentUser,
  onClose,
  onCreate,
  onUnauthorized,
}: CreateChatDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [members, setMembers] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isChannel = kind === 'channel';
  const entityName = isChannel ? 'канал' : 'группу';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Укажите название.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        title: trimmedTitle,
        description: description.trim(),
        avatar_url: avatarUrl.trim(),
        is_public: isPublic,
        member_ids: members.map((user) => user.id),
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : `Не удалось создать ${entityName}`,
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={isChannel ? 'Новый канал' : 'Новая группа'}
      subtitle={
        isChannel
          ? 'Публичный канал можно найти по ID, приватный — только по приглашению.'
          : 'Добавьте участников сразу или пригласите их позже в настройках.'
      }
      onClose={onClose}
      closeDisabled={submitting}
      size="medium"
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
            form="community-create-form"
            className="button button--primary"
            disabled={submitting || !title.trim()}
          >
            {submitting ? <span className="spinner spinner--small" /> : null}
            Создать {isChannel ? 'канал' : 'группу'}
          </button>
        </>
      }
    >
      <form id="community-create-form" className="dialog-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <label className="field">
          <span className="field__label">Название</span>
          <input
            className="field__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={isChannel ? 'Например, Новости продукта' : 'Например, Команда дизайна'}
            maxLength={128}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">Описание</span>
          <textarea
            className="field__input field__input--textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Необязательно"
            maxLength={2000}
            rows={3}
          />
        </label>

        <label className="field">
          <span className="field__label">Ссылка на аватар</span>
          <input
            className="field__input"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://example.com/avatar.png"
            maxLength={2048}
          />
        </label>

        {isChannel ? (
          <div className="field">
            <span className="field__label">Доступ</span>
            <button
              type="button"
              className={`visibility-toggle${isPublic ? ' is-public' : ''}`}
              onClick={() => setIsPublic((value) => !value)}
              aria-pressed={isPublic}
            >
              <span className="visibility-toggle__icon">
                {isPublic ? <GlobeIcon width={17} height={17} /> : <LockIcon width={17} height={17} />}
              </span>
              <span className="visibility-toggle__text">
                <strong>{isPublic ? 'Публичный канал' : 'Приватный канал'}</strong>
                <span>
                  {isPublic
                    ? 'Любой пользователь сможет открыть канал по ID и подписаться.'
                    : 'Открыть канал смогут только приглашённые участники.'}
                </span>
              </span>
              <span className={`switch${isPublic ? ' is-on' : ''}`} aria-hidden="true">
                <span className="switch__thumb" />
              </span>
            </button>
          </div>
        ) : null}

        <div className="field">
          <span className="field__label">
            {isChannel ? 'Начальные подписчики' : 'Участники'}
          </span>
          <UserMultiSelect
            token={token}
            currentUserId={currentUser.id}
            selected={members}
            onChange={setMembers}
            onUnauthorized={onUnauthorized}
          />
          <span className="field__hint">
            {members.length > 0
              ? `Выбрано: ${members.length}`
              : 'Можно пропустить и добавить позже.'}
          </span>
        </div>
      </form>
    </Modal>
  );
}
