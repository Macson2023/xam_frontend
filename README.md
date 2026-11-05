# xam_frontend

Веб-клиент мессенджера **xam**: регистрация и вход, поиск пользователей, личные диалоги,
обмен текстовыми сообщениями и изображениями в реальном времени, статусы `online/offline`
и индикатор «печатает».

Фронтенд реализован по техническому заданию [`tz_frontend.md`](tz_frontend.md) и полностью
совместим с бэкендом [`xam_backend`](https://github.com/Macson2023/xam_backend)
(FastAPI + PostgreSQL + WebSocket) и сервисом звонков
[`xam_call_service`](https://github.com/Macson2023/xam_call_service) (WebRTC-сигналинг).

## Возможности

- Регистрация и вход по JWT, проверка сессии при запуске, обработка истечения токена
- Поиск пользователей по `username` с debounce и отменой устаревших запросов
- Список диалогов с последним сообщением, временем, счётчиком непрочитанных и сортировкой
- История сообщений с cursor-based пагинацией и сохранением позиции скролла
- Оптимистичная отправка (`client_message_id`), дедупликация REST + WebSocket, повтор при ошибке
- Отправка изображений (JPEG, PNG, GIF, WEBP до 5 МиБ) с подписью: выбор файла, drag-and-drop,
  вставка из буфера, предпросмотр вложения, полноэкранный просмотр по клику
- Realtime через нативный WebSocket: новые сообщения и изображения, статусы, typing, ping/pong
- Автопереподключение с экспоненциальной задержкой и синхронизация после реконнекта
- Аудио- и видеозвонки 1:1 через WebRTC: кнопки в шапке чата, входящий звонок,
  приём/отклонение, mute, включение/выключение камеры, таймер и завершение звонка
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

### 2. Запустите сервис звонков

Из репозитория `xam_call_service`:

```bash
docker compose up -d --build
```

Сервис звонков будет доступен на `http://localhost:8081`, а его WebSocket — на
`ws://localhost:8081/ws/calls`. `SECRET_KEY` сервиса звонков должен совпадать с
`SECRET_KEY` из `xam_backend` — звонки используют тот же JWT.

### 3. Запустите фронтенд

```bash
npm install
npm run dev
```

Откройте http://localhost:5173.

Vite проксирует `/api`, `/ws` и `/media` на `http://localhost:8000`, а `/calls-api`
и `/calls-ws` — на `http://localhost:8081`, поэтому CORS в dev-режиме не требуется.
Зарегистрируйте двух пользователей в разных браузерах (или обычном и приватном окне),
найдите второго по username, начните диалог — сообщения приходят мгновенно. Кнопки
аудио- и видеозвонка находятся в шапке открытого диалога.

## Конфигурация

Переменные окружения Vite (см. [`.env.example`](.env.example)):

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `VITE_API_URL` | пусто | Origin API, например `https://api.example.com`. Пусто — same-origin (Vite proxy/nginx) |
| `VITE_WS_URL` | значение `VITE_API_URL` или текущий origin | Origin WebSocket-сервера без `/ws` |
| `VITE_CALLS_URL` | пусто | Origin сервиса звонков без `/api/v1`. Пусто — same-origin через `/calls-api` и `/calls-ws` |

Если API, сервис звонков и фронтенд на разных доменах, при сборке укажите адреса, а на
бэкендах добавьте домен фронтенда в `CORS_ORIGINS` (`xam_backend` и `xam_call_service`).

```bash
# .env
VITE_API_URL=https://api.example.com
VITE_WS_URL=https://api.example.com
VITE_CALLS_URL=https://calls.example.com
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
    calls.ts         # REST и WebSocket сервиса звонков, типы звонков
  auth/
    AuthContext.tsx  # сессия: localStorage, /users/me, login/register/logout
  hooks/
    useRealtime.ts   # WebSocket, ping, реконнект, 1008 → logout
    useMessenger.ts  # чаты, сообщения, поиск состояния, optimistic UI, WS-события
    useCalls.ts      # сигналинг звонков, WebRTC, медиапотоки, mute и камера
  components/
    AuthPage.tsx     # вход и регистрация
    Sidebar.tsx      # профиль, поиск, список диалогов, статус соединения
    UserSearch.tsx   # поиск пользователей
    ChatListItem.tsx # элемент списка диалогов
    ChatPane.tsx     # шапка, история, пагинация, скролл
    MessageBubble.tsx # текст, изображение, статусы и повтор отправки
    ImageLightbox.tsx # полноэкранный просмотр изображения
    Composer.tsx     # отправка текста и изображений с подписью
    CallOverlay.tsx  # экран входящего/исходящего звонка, видео и управление
    Avatar.tsx, Logo.tsx, Icons.tsx, EmptyChat.tsx
  lib/
    format.ts        # даты, время, last_seen, разделители дней
    images.ts        # валидация изображений и форматирование размера
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
   Для изображения до ответа сервера показывается локальный предпросмотр.
4. При ошибке сообщение помечается «Повторить» — повтор использует тот же
   `client_message_id`, поэтому бэкенд не создаёт дубль. Изображение при повторе
   отправляется повторно из выбранного файла.
5. При обрыве WebSocket клиент переподключается (1–15 с) и после восстановления
   перезапрашивает чаты и последние сообщения открытого диалога.

## Docker

Образ собирает статику и раздаёт её через nginx по HTTP и HTTPS, проксируя `/api`,
`/ws` и `/media` на бэкенд, а `/calls-api` и `/calls-ws` — на сервис звонков.

### Docker Compose

Сначала поднимите бэкенд (он публикует порт `8000`) и сервис звонков (порт `8081`):

```bash
# в каталоге xam_backend
docker compose up -d

# в каталоге xam_call_service
docker compose up -d --build
```

Затем соберите и запустите фронтенд:

```bash
# в каталоге xam_frontend
docker compose up -d --build
```

Откройте http://localhost:8080 или https://localhost:8444. По умолчанию nginx
проксирует запросы на `http://host.docker.internal:8000` (бэкенд) и
`http://host.docker.internal:8081` (сервис звонков), то есть на сервисы,
запущенные на хосте.

Настройки задаются в `.env` (см. [`.env.example`](.env.example)) или через окружение:

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `FRONTEND_PORT` | `8080` | Порт HTTP на хосте |
| `FRONTEND_TLS_PORT` | `8444` | Порт HTTPS на хосте |
| `BACKEND_ORIGIN` | `http://host.docker.internal:8000` | Адрес бэкенда для `/api`, `/ws` и `/media` |
| `CALLS_ORIGIN` | `http://host.docker.internal:8081` | Адрес сервиса звонков для `/calls-api` и `/calls-ws` |
| `VITE_API_URL` | пусто | Origin API, вшивается в сборку (обычно не нужен при проксировании) |
| `VITE_WS_URL` | пусто | Origin WebSocket, вшивается в сборку |
| `VITE_CALLS_URL` | пусто | Origin сервиса звонков, вшивается в сборку |
| `TLS_HOSTS` | `localhost,127.0.0.1` | SAN самоподписанного сертификата |
| `TLS_CN` | `localhost` | Common Name сертификата |
| `TLS_CERT_DAYS` | `825` | Срок действия сертификата |
| `TLS_REGENERATE` | `0` | `1` — пересоздать сертификат при старте |

```bash
# пример: другой порт и бэкенд по имени сервиса
FRONTEND_PORT=3000 BACKEND_ORIGIN=http://api:8000 docker compose up -d --build
```

Полезные команды:

```bash
docker compose ps        # статус и health-check
docker compose logs -f   # логи nginx
docker compose down      # остановить
```

### Без Compose

```bash
docker build -t xam_frontend .
docker run --rm -p 8080:80 -p 8444:443 \
  -e BACKEND_ORIGIN=http://host.docker.internal:8000 \
  -e CALLS_ORIGIN=http://host.docker.internal:8081 \
  -v frontend_tls_certs:/etc/nginx/certs \
  xam_frontend
```

В контейнерной сети укажите `BACKEND_ORIGIN` и `CALLS_ORIGIN` с именами сервисов
(например, `http://api:8000` и `http://calls:8081`). Health-check nginx: `GET /healthz`.

### HTTPS

HTTPS нужен, чтобы браузер разрешил камеру и микрофон вне `localhost`
(secure context). Nginx слушает и `80`, и `443`; сертификат самоподписанный и
создаётся при первом старте контейнера в volume `frontend_tls_certs`.

Для доступа с другого устройства добавьте его адрес в SAN и пересоздайте сертификат:

```bash
# .env
TLS_HOSTS=localhost,127.0.0.1,192.168.1.50
TLS_CN=192.168.1.50
TLS_REGENERATE=1
```

```bash
docker compose up -d --build
```

После старта верните `TLS_REGENERATE=0`. Браузер один раз покажет предупреждение
о самоподписанном сертификате — примите исключение либо импортируйте сертификат
в доверенные:

```bash
docker compose cp frontend:/etc/nginx/certs/server.crt ./server.crt
```

CORS при этом не нужен: страница и запросы `/api`, `/calls-api`, `/ws`, `/calls-ws`
идут на один origin, а nginx проксирует их внутри Docker-сети.

### Доступ по сети (LAN)

Docker-контейнер публикует порты на всех интерфейсах, поэтому с другого устройства
в той же сети открывайте:

- **https://<LAN-IP>:8444** — основной адрес, камера и микрофон работают;
- **http://<LAN-IP>:8080** — только просмотр и чат, `getUserMedia` будет заблокирован.

Узнать IP хоста на Windows: `ipconfig` (адрес адаптера Wi-Fi/Ethernet). Адрес должен
совпадать с `TLS_HOSTS`/`TLS_CN` в `.env`, иначе браузер покажет ошибку имени
сертификата. VPN, гостевые сети и client isolation на роутере блокируют такие
подключения.

Если другой компьютер или телефон не подключается, разрешите входящие порты в
Windows Firewall (PowerShell от администратора):

```powershell
New-NetFirewallRule -DisplayName "xam_frontend" -Direction Inbound `
  -Protocol TCP -LocalPort 8080,8444 -Action Allow -Profile Any
```

Для dev-сервера `npm run dev` теперь слушает все интерфейсы (`host: true`), поэтому
он доступен по `http://<LAN-IP>:5173`. Но вне `localhost` камера и микрофон требуют
HTTPS — для звонков с другого устройства используйте Docker на `:8444`.

## Ограничения

- Только личные диалоги, текст и изображения — согласно MVP бэкенда. Видео, документы
  и другие вложения не поддерживаются; SVG отклоняется бэкендом.
- Изображения принимаются до 5 МиБ (`MAX_IMAGE_SIZE_BYTES` на бэкенде); формат проверяется
  и на клиенте, и по содержимому файла на сервере.
- URL изображений относительные (`/media/images/...`) и в dev/nginx проксируются на бэкенд;
  при отдельном домене API клиент добавляет к ним `VITE_API_URL`.
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
