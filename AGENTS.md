# AGENTS.md

## Репозиторий

Этот проект всегда хранится в https://github.com/Macson2023/xam_frontend
(ветка `main`, remote `origin`).

Правило: любой новый или изменённый код по этому проекту нужно коммитить и отправлять
(`git push origin main`) в этот репозиторий, не оставляя изменения только локально.

## Проект

Веб-клиент мессенджера на React 19 + TypeScript + Vite. Требования: `tz_frontend.md`.
Бэкенд: https://github.com/Macson2023/xam_backend (FastAPI + WebSocket).

В dev-режиме Vite проксирует `/api` и `/ws` на `http://localhost:8000`.

## Команды

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Перед коммитом обязательно выполняйте `npm run build`.
