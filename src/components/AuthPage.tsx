import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AlertIcon, CloseIcon, LockIcon, UsersIcon, ZapIcon } from './Icons';
import { Logo } from './Logo';

type Mode = 'login' | 'register';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;

interface FieldErrors {
  username?: string;
  password?: string;
  displayName?: string;
}

export function AuthPage() {
  const { login, register, notice, clearNotice } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    if (next === mode) {
      return;
    }
    setMode(next);
    setFieldErrors({});
    setError(null);
    setPassword('');
  };

  const validate = (): boolean => {
    const errors: FieldErrors = {};

    if (mode === 'register') {
      if (!USERNAME_PATTERN.test(username.trim())) {
        errors.username = '3–32 символа: латиница, цифры и «_»';
      }
      if (password.length < 8) {
        errors.password = 'Минимум 8 символов';
      } else if (password.length > 72) {
        errors.password = 'Не более 72 символов';
      }
      const name = displayName.trim();
      if (!name) {
        errors.displayName = 'Укажите отображаемое имя';
      } else if (name.length > 64) {
        errors.displayName = 'Не более 64 символов';
      }
    } else {
      if (!username.trim()) {
        errors.username = 'Введите username';
      }
      if (!password) {
        errors.password = 'Введите пароль';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    clearNotice();
    if (!validate()) {
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register({
          username: username.trim(),
          password,
          display_name: displayName.trim(),
        });
      } else {
        await login({ username: username.trim(), password });
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.status === 409
            ? 'Этот username уже занят'
            : caught.status === 401
              ? 'Неверный username или пароль'
              : caught.message,
        );
      } else {
        setError(caught instanceof Error ? caught.message : 'Не удалось выполнить вход');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth__intro">
        <div className="auth__brand">
          <Logo size={44} />
          <span className="auth__brand-name">xam</span>
        </div>
        <h1 className="auth__title">
          Общение
          <br />
          без задержек
        </h1>
        <p className="auth__subtitle">
          Личные диалоги, мгновенная доставка сообщений и статусы собеседников — в одном окне.
        </p>
        <ul className="auth__features">
          <li>
            <span className="auth__feature-icon">
              <ZapIcon width={18} height={18} />
            </span>
            Сообщения в реальном времени через WebSocket
          </li>
          <li>
            <span className="auth__feature-icon">
              <UsersIcon width={18} height={18} />
            </span>
            Поиск пользователей и личные диалоги
          </li>
          <li>
            <span className="auth__feature-icon">
              <LockIcon width={18} height={18} />
            </span>
            JWT-аутентификация и защищённые сессии
          </li>
        </ul>
        <p className="auth__hint">
          Для локального запуска бэкенд доступен на <code>localhost:8000</code>, документация —{' '}
          <code>/docs</code>.
        </p>
      </section>

      <section className="auth__panel">
        <div className="auth__mobile-brand">
          <Logo size={30} />
          <span>xam</span>
        </div>
        <div className="auth-card">
          <div className="auth-card__tabs" role="tablist" aria-label="Режим входа">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => switchMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => switchMode('register')}
            >
              Регистрация
            </button>
          </div>

          <h2 className="auth-card__title">
            {mode === 'login' ? 'С возвращением' : 'Создайте аккаунт'}
          </h2>
          <p className="auth-card__subtitle">
            {mode === 'login'
              ? 'Введите username и пароль, чтобы продолжить переписку.'
              : 'Придумайте username и пароль — это займёт меньше минуты.'}
          </p>

          {notice ? (
            <div className="auth-card__notice" role="status">
              <AlertIcon width={18} height={18} />
              <span>{notice}</span>
              <button type="button" onClick={clearNotice} aria-label="Скрыть уведомление">
                <CloseIcon width={16} height={16} />
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="auth-card__error" role="alert">
              <AlertIcon width={18} height={18} />
              <span>{error}</span>
            </div>
          ) : null}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {mode === 'register' ? (
              <label className="field">
                <span className="field__label">Отображаемое имя</span>
                <input
                  className={fieldErrors.displayName ? 'field__input has-error' : 'field__input'}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Например, Анна Смирнова"
                  maxLength={64}
                  autoComplete="name"
                  autoFocus
                />
                {fieldErrors.displayName ? (
                  <span className="field__error">{fieldErrors.displayName}</span>
                ) : null}
              </label>
            ) : null}

            <label className="field">
              <span className="field__label">Username</span>
              <input
                className={fieldErrors.username ? 'field__input has-error' : 'field__input'}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="username"
                maxLength={32}
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus={mode === 'login'}
              />
              {fieldErrors.username ? (
                <span className="field__error">{fieldErrors.username}</span>
              ) : null}
            </label>

            <label className="field">
              <span className="field__label">Пароль</span>
              <input
                className={fieldErrors.password ? 'field__input has-error' : 'field__input'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'register' ? 'Минимум 8 символов' : 'Ваш пароль'}
                maxLength={72}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
              {fieldErrors.password ? (
                <span className="field__error">{fieldErrors.password}</span>
              ) : null}
            </label>

            <button className="button button--primary auth-form__submit" type="submit" disabled={submitting}>
              {submitting ? <span className="spinner" aria-hidden="true" /> : null}
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <p className="auth-card__switch">
            {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Зарегистрируйтесь' : 'Войдите'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
