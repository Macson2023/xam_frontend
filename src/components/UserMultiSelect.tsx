import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/client';
import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { Avatar } from './Avatar';
import { CloseIcon, PlusIcon, SearchIcon } from './Icons';

interface UserMultiSelectProps {
  token: string;
  currentUserId: string;
  selected: User[];
  excludedIds?: string[];
  onChange: (users: User[]) => void;
  onUnauthorized: () => void;
  placeholder?: string;
}

export function UserMultiSelect({
  token,
  currentUserId,
  selected,
  excludedIds = [],
  onChange,
  onUnauthorized,
  placeholder = 'Найти пользователя по username',
}: UserMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const excluded = useMemo(
    () => new Set([currentUserId, ...excludedIds, ...selected.map((user) => user.id)]),
    [currentUserId, excludedIds, selected],
  );

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      api
        .searchUsers(term, token, controller.signal)
        .then((users) => {
          if (!controller.signal.aborted) {
            setResults(users);
          }
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          if (caught instanceof DOMException && caught.name === 'AbortError') {
            return;
          }
          if (caught instanceof ApiError && caught.status === 401) {
            onUnauthorized();
            return;
          }
          setResults([]);
          setError(caught instanceof Error ? caught.message : 'Поиск недоступен');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, token, onUnauthorized]);

  const addUser = (user: User) => {
    if (excluded.has(user.id) && !selected.some((item) => item.id === user.id)) {
      return;
    }
    onChange([...selected, user]);
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  const visibleResults = results.filter((user) => !excluded.has(user.id));
  const trimmed = query.trim();

  return (
    <div className="user-picker">
      {selected.length > 0 ? (
        <div className="user-picker__selected">
          {selected.map((user) => (
            <span className="user-chip" key={user.id}>
              <Avatar user={user} size={24} />
              <span className="user-chip__name">{user.display_name}</span>
              <button
                type="button"
                className="user-chip__remove"
                onClick={() => onChange(selected.filter((item) => item.id !== user.id))}
                aria-label={`Убрать ${user.display_name}`}
              >
                <CloseIcon width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="search__field user-picker__field">
        <SearchIcon width={18} height={18} className="search__icon" />
        <input
          ref={inputRef}
          className="search__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          aria-label="Поиск пользователей"
        />
        {query ? (
          <button
            type="button"
            className="search__clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Очистить поиск"
          >
            <CloseIcon width={15} height={15} />
          </button>
        ) : null}
      </div>

      {trimmed ? (
        <div className="user-picker__results">
          <div className="search__caption">
            {searching ? 'Ищем…' : visibleResults.length > 0 ? 'Пользователи' : 'Результаты'}
          </div>
          {error ? <div className="search__error">{error}</div> : null}
          {!searching && !error && visibleResults.length === 0 ? (
            <div className="search__empty">Пользователь «{trimmed}» не найден или уже добавлен</div>
          ) : null}
          {visibleResults.map((user) => (
            <button
              type="button"
              className="user-picker__item"
              key={user.id}
              onClick={() => addUser(user)}
            >
              <Avatar user={user} size={36} />
              <span className="user-picker__item-text">
                <span className="search-user__name">{user.display_name}</span>
                <span className="search-user__username">@{user.username}</span>
              </span>
              <span className="user-picker__add">
                <PlusIcon width={15} height={15} />
                Добавить
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
