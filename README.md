# xam_frontend

Веб-клиент мессенджера **xam**: регистрация и вход, поиск пользователей, личные диалоги,
обмен сообщениями в реальном времени, статусы `online/offline` и индикатор «печатает».

Фронтенд реализован по техническому заданию [`tz_frontend.md`](tz_frontend.md) и полностью
совместим с бэкендом [`xam_backend`](https://github.com/Macson2023/xam_backend)
(FastAPI + PostgreSQL + WebSocket).

## Возможности

- Регистрация и вход по JWT, проверка сессии при запуске, обработка истечения токена
- Поиск пользователей по `username` с debounce и отменой устаревших запросов
- Список диалогов с последним сообщением, временем, счётчиком непрочитанных и сортировкой
- История сообщений с cursor-based пагинацией и сохранением позиции скролла
- Оптимистичная отправка (`client_message_id`), дедупликация REST + WebSocket, повтор при ошибке
- Realtime через нативный WebSocket: новые сообщения, статусы, typing, ping/pong
- Автопереподключение с экспоненциальной задержкой и синхронизация после реконнекта
- Отметка сообщений прочитанными при открытии диалога и получении сообщения
- Адаптивный интерфейс: две панели на десктопе, «список ↔ чат» на мобильных
- Тёмная тема, состояния загрузки/пустоты/ошибки, доступная клавиатурная навигация

## Стек

| Слой | Технологии |
| --- | --- |
| UI | React 19, TypeScript (strict), CSS-переменные |
| Сборка | Vite 7 |
| HTTP | нативный `fetch` + `AbortController` |
| Realtime | браузерный `WebSocket` |
| Состояние | React hooks + Context (без внешних стейт-менеджеров) |
| Деплой | статическая сборка или Docker + nginx |

## Быстрый старт

### 1. Запустите бэкенд

Из репозитория [`xam_backend`](https://github.com/Macson2023/xam_backend):

```bash
docker compose up --build
```

API будет доступен на `http://localhost:8000` (Swagger UI — `/docs`, health — `/health`).
Альтернативный запуск без Docker описан в README бэкенда.

### 2. Запустите фронтенд

```bash
npm install
npm run dev
```

Откройте http://localhost:5173.

Vite проксирует `/api` и `/ws` на `http://localhost:8000`, поэтому CORS в dev-режиме
не требуется. Зарегистрируйте двух пользователей в разных браузерах (или обычном и
приватном окне), найдите второго по username и начните диалог — сообщения приходят
мгновенно.

## Конфигурация

Переменные окружения Vite (см. [`.env.example`](.env.example)):

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `VITE_API_URL` | пусто | Origin API, например `https://api.example.com`. Пусто — same-origin (Vite proxy/nginx) |
| `VITE_WS_URL` | значение `VITE_API_URL` или текущий origin | Origin WebSocket-сервера без `/ws` |

Если API и фронтенд на разных доменах, при сборке укажите оба адреса, а на бэкенде
добавьте домен фронтенда в `CORS_ORIGINS`.

```bash
# .env
VITE_API_URL=https://api.example.com
VITE_WS_URL=https://api.example.com
```

## Скрипты

```bash
npm run dev        # dev-сервер с proxy на localhost:8000
npm run typecheck  # проверка TypeScript
npm run build      # typecheck + production-сборка в dist/
npm run preview    # локальный просмотр собранной статики
```

## Архитектура

```
src/
  api/
    client.ts        # fetch-обёртка, ApiError, все методы API, URL WebSocket
    types.ts         # типы контракта бэкенда и WS-событий
  auth/
    AuthContext.tsx  # сессия: localStorage, /users/me, login/register/logout
  hooks/
    useRealtime.ts   # WebSocket, ping, реконнект, 1008 → logout
    useMessenger.ts  # чаты, сообщения, поиск состояния, optimistic UI, WS-события
  components/
    AuthPage.tsx     # вход и регистрация
    Sidebar.tsx      # профиль, поиск, список диалогов, статус соединения
    UserSearch.tsx   # поиск пользователей
    ChatListItem.tsx # элемент списка диалогов
    ChatPane.tsx     # шапка, история, пагинация, скролл
    MessageBubble.tsx
    Composer.tsx
    Avatar.tsx, Logo.tsx, Icons.tsx, EmptyChat.tsx
  lib/
    format.ts        # даты, время, last_seen, разделители дней
    messages.ts      # сортировка, merge и дедупликация сообщений
    uuid.ts          # UUID v4 для client_message_id
  App.tsx            # AuthProvider + выбор экрана
  MessengerPage.tsx  # компоновка мессенджера
```

### Как устроена синхронизация

1. При входе загружается профиль, список чатов и открывается WebSocket.
2. История сообщений запрашивается по 50 штук; более ранние — по `before=next_cursor`.
3. Отправка сразу показывает сообщение со статусом «отправляется» и UUID
   `client_message_id`. Ответ REST и событие `new_message` сливаются в одну запись.
4. При ошибке сообщение помечается «Повторить» — повтор использует тот же
   `client_message_id`, поэтому бэкенд не создаёт дубль.
5. При обрыве WebSocket клиент переподключается (1–15 с) и после восстановления
   перезапрашивает чаты и последние сообщения открытого диалога.

## Docker

Образ собирает статику и раздаёт её через nginx, проксируя `/api` и `/ws` на бэкенд:

```bash
docker build -t xam_frontend .
docker run --rm -p 8080:80 \
  -e BACKEND_ORIGIN=http://host.docker.internal:8000 \
  xam_frontend
```

Откройте http://localhost:8080. В контейнерной сети укажите `BACKEND_ORIGIN` с именем
сервиса бэкенда (например, `http://api:8000`). Health-check nginx: `GET /`.

## Ограничения

- Только личные диалоги и текстовые сообщения — согласно MVP бэкенда.
- Бэкенд не отдаёт снимок присутствия: статусы приходят только при переходах
  `online/offline`. Клиент дополнительно помечает собеседника онлайн, когда от него
  приходит сообщение или событие `typing`, поэтому после первого сообщения статус
  обновляется. Собеседник, подключившийся до вас и ещё не проявивший активности, может
  отображаться офлайн до следующего перехода.
- Отметка «прочитано» не рассылается бэкендом через WebSocket, поэтому двойные галочки
  обновляются при загрузке истории/списка чатов.
- JWT хранится в `localStorage`; для продакшена с повышенными требованиями безопасности
  стоит перейти на httpOnly-cookie (потребует изменений на бэкенде).

## Репозиторий

https://github.com/Macson2023/xam_frontend
