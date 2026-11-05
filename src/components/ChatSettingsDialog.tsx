import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { Chat, ChatDetail, ChatMember, MemberRole, User } from '../api/types';
import {
  canManageMembers,
  canRemoveMember,
  chatKindLabel,
  isOwner,
  memberCountLabel,
  roleLabel,
} from '../lib/chat';
import { ConfirmDialog } from './ConfirmDialog';
import { Avatar } from './Avatar';
import { GlobeIcon, LockIcon } from './Icons';
import { Modal } from './Modal';
import { UserMultiSelect } from './UserMultiSelect';

interface ChatSettingsDialogProps {
  chat: Chat;
  detail: ChatDetail | null;
  currentUser: User;
  token: string;
  loading: boolean;
  loadError: string | null;
  onClose: () => void;
  onUpdate: (payload: {
    title: string;
    description: string | null;
    avatar_url: string | null;
    is_public?: boolean;
  }) => Promise<void>;
  onAddMembers: (users: User[], role: 'admin' | 'member') => Promise<void>;
  onUpdateRole: (userId: string, role: 'admin' | 'member') => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onUnauthorized: () => void;
}

interface PendingConfirm {
  kind: 'delete' | 'leave' | 'remove';
  userId?: string;
  title: string;
  message: string;
  label: string;
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Недостаточно прав для этого действия.';
    }
    if (error.status === 404) {
      return 'Объект не найден или вы больше не участник.';
    }
    if (error.status === 400) {
      return error.message || 'Действие недоступно.';
    }
    if (error.status === 422) {
      return 'Проверьте введённые данные.';
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function MemberRoleBadge({ role }: { role: MemberRole }) {
  return <span className={`member-role member-role--${role}`}>{roleLabel(role)}</span>;
}

export function ChatSettingsDialog({
  chat,
  detail,
  currentUser,
  token,
  loading,
  loadError,
  onClose,
  onUpdate,
  onAddMembers,
  onUpdateRole,
  onRemoveMember,
  onLeave,
  onDelete,
  onRefresh,
  onUnauthorized,
}: ChatSettingsDialogProps) {
  const isChannel = chat.type === 'channel';
  const manageable = canManageMembers(chat);
  const owner = isOwner(chat);
  const entity = isChannel ? 'канал' : 'группу';

  const [title, setTitle] = useState(chat.title ?? '');
  const [description, setDescription] = useState(chat.description ?? '');
  const [avatarUrl, setAvatarUrl] = useState(chat.avatar_url ?? '');
  const [isPublic, setIsPublic] = useState(chat.is_public);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  const [newMembers, setNewMembers] = useState<User[]>([]);
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member');
  const [adding, setAdding] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersNotice, setMembersNotice] = useState<string | null>(null);
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(chat.title ?? '');
    setDescription(chat.description ?? '');
    setAvatarUrl(chat.avatar_url ?? '');
    setIsPublic(chat.is_public);
  }, [chat.id, chat.title, chat.description, chat.avatar_url, chat.is_public]);

  useEffect(() => {
    setNewMembers([]);
    setNewRole('member');
    setMembersError(null);
    setMembersNotice(null);
    setMemberBusyId(null);
  }, [chat.id]);

  const members = detail?.members ?? [];
  const excludedIds = useMemo(() => members.map((member) => member.user.id), [members]);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setProfileError('Название не может быть пустым.');
      return;
    }
    setSaving(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      await onUpdate({
        title: trimmedTitle,
        description: description.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        is_public: isChannel ? isPublic : undefined,
      });
      setProfileNotice('Изменения сохранены.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setProfileError(describeError(error, 'Не удалось сохранить изменения.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddMembers = async () => {
    if (newMembers.length === 0) {
      return;
    }
    setAdding(true);
    setMembersError(null);
    setMembersNotice(null);
    try {
      await onAddMembers(newMembers, newRole);
      setMembersNotice(
        newMembers.length === 1 ? 'Участник добавлен.' : `Добавлено участников: ${newMembers.length}.`,
      );
      setNewMembers([]);
      setNewRole('member');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setMembersError(describeError(error, 'Не удалось добавить участников.'));
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (member: ChatMember, role: 'admin' | 'member') => {
    setMemberBusyId(member.user.id);
    setMembersError(null);
    setMembersNotice(null);
    try {
      await onUpdateRole(member.user.id, role);
      setMembersNotice('Роль обновлена.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setMembersError(describeError(error, 'Не удалось изменить роль.'));
    } finally {
      setMemberBusyId(null);
    }
  };

  const openConfirm = (next: PendingConfirm) => {
    setConfirmError(null);
    setPendingConfirm(next);
  };

  const handleConfirm = async () => {
    if (!pendingConfirm) {
      return;
    }
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (pendingConfirm.kind === 'delete') {
        await onDelete();
      } else if (pendingConfirm.kind === 'leave') {
        await onLeave();
      } else if (pendingConfirm.kind === 'remove' && pendingConfirm.userId) {
        setMemberBusyId(pendingConfirm.userId);
        await onRemoveMember(pendingConfirm.userId);
        setMembersNotice('Участник удалён.');
      }
      setPendingConfirm(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      if (
        pendingConfirm.kind === 'leave' &&
        error instanceof ApiError &&
        error.status === 403
      ) {
        setConfirmError(
          'Администратор не может выйти, пока владелец не снимет роль администратора.',
        );
      } else {
        setConfirmError(describeError(error, 'Не удалось выполнить действие.'));
      }
    } finally {
      setConfirmBusy(false);
      setMemberBusyId(null);
    }
  };

  const handleRefresh = () => {
    void onRefresh();
  };

  return (
    <>
      <Modal
        title={isChannel ? 'Настройки канала' : 'Настройки группы'}
        subtitle={`${chatKindLabel(chat)} · ${memberCountLabel(chat.member_count)}`}
        onClose={() => {
          if (!pendingConfirm) {
            onClose();
          }
        }}
        closeDisabled={pendingConfirm !== null}
        size="large"
        footer={
          <button type="button" className="button button--ghost" onClick={onClose}>
            Готово
          </button>
        }
      >
        <div className="settings">
          <section className="settings__section">
            <h3 className="settings__title">Профиль</h3>
            {!manageable ? (
              <p className="settings__hint">
                Изменять профиль могут только владелец и администраторы.
              </p>
            ) : null}
            <form className="dialog-form" onSubmit={handleProfileSubmit}>
              {profileError ? (
                <div className="form-error" role="alert">
                  {profileError}
                </div>
              ) : null}
              {profileNotice ? (
                <div className="form-notice" role="status">
                  {profileNotice}
                </div>
              ) : null}
              <label className="field">
                <span className="field__label">Название</span>
                <input
                  className="field__input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={128}
                  disabled={!manageable || saving}
                />
              </label>
              <label className="field">
                <span className="field__label">Описание</span>
                <textarea
                  className="field__input field__input--textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  disabled={!manageable || saving}
                />
              </label>
              <label className="field">
                <span className="field__label">Ссылка на аватар</span>
                <input
                  className="field__input"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  maxLength={2048}
                  disabled={!manageable || saving}
                />
              </label>
              {isChannel ? (
                <div className="field">
                  <span className="field__label">ID канала</span>
                  <code className="settings__id">{chat.id}</code>
                  <span className="field__hint">
                    По этому ID канал можно открыть через «Открыть канал по ID».
                  </span>
                </div>
              ) : null}
              {isChannel ? (
                <div className="field">
                  <span className="field__label">Доступ</span>
                  <button
                    type="button"
                    className={`visibility-toggle${isPublic ? ' is-public' : ''}`}
                    onClick={() => setIsPublic((value) => !value)}
                    aria-pressed={isPublic}
                    disabled={!manageable || saving}
                  >
                    <span className="visibility-toggle__icon">
                      {isPublic ? (
                        <GlobeIcon width={17} height={17} />
                      ) : (
                        <LockIcon width={17} height={17} />
                      )}
                    </span>
                    <span className="visibility-toggle__text">
                      <strong>{isPublic ? 'Публичный канал' : 'Приватный канал'}</strong>
                      <span>
                        {isPublic
                          ? 'Доступен по ID любому пользователю.'
                          : 'Только для приглашённых участников.'}
                      </span>
                    </span>
                    <span className={`switch${isPublic ? ' is-on' : ''}`} aria-hidden="true">
                      <span className="switch__thumb" />
                    </span>
                  </button>
                </div>
              ) : null}
              {manageable ? (
                <div className="settings__actions">
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={saving || !title.trim()}
                  >
                    {saving ? <span className="spinner spinner--small" /> : null}
                    Сохранить
                  </button>
                </div>
              ) : null}
            </form>
          </section>

          <section className="settings__section">
            <div className="settings__section-head">
              <h3 className="settings__title">Участники</h3>
              <span className="settings__count">{members.length || chat.member_count}</span>
              <button
                type="button"
                className="button button--ghost settings__refresh"
                onClick={handleRefresh}
                disabled={loading}
              >
                {loading ? <span className="spinner spinner--dark" /> : null}
                Обновить
              </button>
            </div>

            {loadError ? (
              <div className="form-error" role="alert">
                {loadError}
              </div>
            ) : null}
            {membersError ? (
              <div className="form-error" role="alert">
                {membersError}
              </div>
            ) : null}
            {membersNotice ? (
              <div className="form-notice" role="status">
                {membersNotice}
              </div>
            ) : null}

            {loading && members.length === 0 ? (
              <div className="settings__loading">
                <span className="spinner" />
                Загружаем участников…
              </div>
            ) : null}

            <div className="member-list">
              {members.map((member) => {
                const isMe = member.user.id === currentUser.id;
                const canRemove = !isMe && canRemoveMember(chat, member.role);
                const canChangeRole = owner && member.role !== 'owner';
                return (
                  <div className="member-row" key={member.user.id}>
                    <Avatar user={member.user} size={38} />
                    <div className="member-row__info">
                      <span className="member-row__name">
                        {member.user.display_name}
                        {isMe ? <span className="member-row__me">это вы</span> : null}
                      </span>
                      <span className="member-row__username">@{member.user.username}</span>
                    </div>
                    {canChangeRole ? (
                      <select
                        className="member-row__select"
                        value={member.role === 'admin' ? 'admin' : 'member'}
                        onChange={(event) =>
                          void handleRoleChange(
                            member,
                            event.target.value === 'admin' ? 'admin' : 'member',
                          )
                        }
                        disabled={memberBusyId === member.user.id}
                        aria-label={`Роль ${member.user.display_name}`}
                      >
                        <option value="member">Участник</option>
                        <option value="admin">Администратор</option>
                      </select>
                    ) : (
                      <MemberRoleBadge role={member.role} />
                    )}
                    {canRemove ? (
                      <button
                        type="button"
                        className="button button--ghost member-row__remove"
                        disabled={memberBusyId === member.user.id}
                        onClick={() =>
                          openConfirm({
                            kind: 'remove',
                            userId: member.user.id,
                            title: 'Удалить участника',
                            message: `Удалить ${member.user.display_name} из этой ${
                              isChannel ? 'канала' : 'группы'
                            }?`,
                            label: 'Удалить',
                          })
                        }
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {manageable ? (
              <div className="settings__add">
                <h4 className="settings__subtitle">Добавить участников</h4>
                <UserMultiSelect
                  token={token}
                  currentUserId={currentUser.id}
                  selected={newMembers}
                  excludedIds={excludedIds}
                  onChange={setNewMembers}
                  onUnauthorized={onUnauthorized}
                  placeholder="Найти пользователя по username"
                />
                <div className="settings__add-row">
                  <label className="settings__role-select">
                    <span>Роль</span>
                    <select
                      value={newRole}
                      onChange={(event) =>
                        setNewRole(event.target.value === 'admin' ? 'admin' : 'member')
                      }
                      disabled={!owner || adding}
                    >
                      <option value="member">Участник</option>
                      <option value="admin" disabled={!owner}>
                        Администратор
                      </option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void handleAddMembers()}
                    disabled={adding || newMembers.length === 0}
                  >
                    {adding ? <span className="spinner spinner--small" /> : null}
                    Добавить
                    {newMembers.length > 0 ? ` (${newMembers.length})` : ''}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="settings__section settings__section--danger">
            <h3 className="settings__title">Опасная зона</h3>
            {owner ? (
              <>
                <p className="settings__hint">
                  Владелец не может выйти из {isChannel ? 'канала' : 'группы'}. Удаление
                  безвозвратно уберёт {entity} у всех участников.
                </p>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() =>
                    openConfirm({
                      kind: 'delete',
                      title: isChannel ? 'Удалить канал' : 'Удалить группу',
                      message: `Удалить ${entity} «${chat.title ?? ''}»? Это действие нельзя отменить.`,
                      label: isChannel ? 'Удалить канал' : 'Удалить группу',
                    })
                  }
                >
                  {isChannel ? 'Удалить канал' : 'Удалить группу'}
                </button>
              </>
            ) : (
              <>
                <p className="settings__hint">
                  {isChannel
                    ? 'Вы перестанете получать сообщения этого канала.'
                    : 'Вы больше не будете получать сообщения этой группы.'}
                </p>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() =>
                    openConfirm({
                      kind: 'leave',
                      title: isChannel ? 'Отписаться от канала' : 'Выйти из группы',
                      message: isChannel
                        ? 'Отписаться от канала? Вы сможете подписаться снова, если канал публичный.'
                        : `Выйти из группы «${chat.title ?? ''}»?`,
                      label: isChannel ? 'Отписаться' : 'Выйти',
                    })
                  }
                >
                  {isChannel ? 'Отписаться от канала' : 'Выйти из группы'}
                </button>
              </>
            )}
          </section>
        </div>
      </Modal>

      {pendingConfirm ? (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.label}
          danger
          busy={confirmBusy}
          error={confirmError}
          onConfirm={() => void handleConfirm()}
          onCancel={() => {
            if (!confirmBusy) {
              setPendingConfirm(null);
              setConfirmError(null);
            }
          }}
        />
      ) : null}
    </>
  );
}
