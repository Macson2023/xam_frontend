import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { Avatar } from './Avatar';
import { CloseIcon, SearchIcon } from './Icons';

interface UserSearchProps {
  token: string;
  currentUserId: string;
  onStartChat: (user: User) => Promise<void>;
  onUnauthorized: () => void;
}

export function UserSearch({ token, currentUserId, onStartChat, onUnauthorized }: UserSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setError(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    setError(null);

    const timer = setTimeout(() => {
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
          setError(caught instanceof Error ? caught.message : 'Поиск недоступен');
          setResults([]);
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

  const handleStart = async (user: User) => {
    setStartingId(user.id);
    setError(null);
    try {
      await onStartChat(user);
      setQuery('');
      setResults([]);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть диалог');
    } finally {
      setStartingId(null);
    }
  };

  const trimmed = query.trim();

  return (
    <div className="search">
      <div className="search__field">
        <SearchIcon width={18} height={18} className="search__icon" />
        <input
          ref={inputRef}
          className="search__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти пользователя по username"
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
        <div className="search__results">
          <div className="search__caption">
            {searching ? 'Ищем…' : results.length > 0 ? 'Найденные пользователи' : 'Результаты'}
          </div>

          {error ? <div className="search__error">{error}</div> : null}

          {!searching && !error && results.length === 0 ? (
            <div className="search__empty">Пользователь «{trimmed}» не найден</div>
          ) : null}

          {results.map((user) => (
            <div className="search-user" key={user.id}>
              <Avatar user={user} size={40} />
              <div className="search-user__text">
                <span className="search-user__name">{user.display_name}</span>
                <span className="search-user__username">@{user.username}</span>
              </div>
              <button
                type="button"
                className="button button--ghost search-user__action"
                onClick={() => void handleStart(user)}
                disabled={startingId !== null || user.id === currentUserId}
              >
                {startingId === user.id ? <span className="spinner spinner--dark" /> : 'Написать'}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
