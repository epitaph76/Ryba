# S-9. Document Collaboration

Дата: `2026-04-09`

**Статус:** `done`

## Область работы

Этот документ фиксирует фактическую реализацию этапа `S-9` из `PROJECT_STATUS.md`.

На этом шаге Ryba получает рабочий collaboration layer именно для документов:

- realtime sync для одного document editor;
- shared editing на базе `Yjs + Hocuspocus`;
- presence / awareness прямо в интерфейсе редактора;
- reconnect внутри живого collab-процесса;
- reuse уже существующей document model, permission model и editor flow из этапов `S-5` и `S-8`.

`S-9` сознательно не превращается в realtime-слой для всего продукта. В этап не входили canvas-realtime, отдельная durable CRDT persistence model и отдельная collaborative ACL поверх workspace roles.

## Что добавлено

### Shared contracts

Добавлен общий контракт collaboration bootstrap:

- `DocumentCollaborationSessionRecord`
- `documentCollaborationSessionRecordSchema`

Он нужен для одного вопроса: может ли пользователь подключиться к документу и доступна ли ему запись.

### API

В document API добавлен маршрут:

- `GET /documents/:documentId/collaboration`

Маршрут:

- проверяет доступ пользователя к workspace и документу;
- определяет, доступно ли право `edit`;
- возвращает:
  - `documentId`
  - `canEdit`

Collab server не дублирует permission logic, а использует существующую модель `owner / editor / viewer` из `S-8`.

### Collab server

`apps/collab` теперь:

- принимает websocket-подключения по `documentId`;
- на `onAuthenticate` валидирует токен через API;
- переводит сессию в `read-write` или `readonly`;
- хранит in-memory snapshot через `Y.encodeStateAsUpdate(...)`;
- на `onLoadDocument` поднимает документ из snapshot, если он уже есть в памяти;
- на `onStoreDocument` обновляет snapshot для reconnect внутри текущего процесса;
- логирует connect / disconnect / load / change / store lifecycle.

Важно: collab server не подмешивает persisted document body из API в live Yjs state при reconnect. Это убирает конфликт между восстановлением живой collaborative-сессии и последним HTTP-снимком документа.

### Web

Во frontend document editor переведён в collaborative mode для уже существующих документов:

- добавлены `@hocuspocus/provider`, `@tiptap/extension-collaboration`, `yjs`;
- `DocumentComposer` работает в двух режимах:
  - локальный draft / unsaved document;
  - realtime document с `HocuspocusProvider`;
- collaboration включается только когда у документа уже есть `documentId`;
- для новых несохранённых документов остаётся прежний локальный UX;
- title и body синхронизируются через один `Y.Doc`;
- presence участников показывается над редактором;
- статус соединения (`connecting`, `connected`, `synced`, `disconnected`, `error`) отражается в UI;
- `viewer` получает readonly collaborative session без отдельной permission-модели в UI.

Дополнительно после live smoke были внесены stabilizing fixes:

- initial seed persisted title/body выполняется на клиенте, а не на сервере;
- seed запускается только одним детерминированно выбранным клиентом после стабилизации awareness;
- пустой collaborative state не затирает локальные `title/body` до первого seed;
- после рестарта `collab` reconnect не смешивает live state с persisted HTTP body.

## Поток данных

Текущий runtime flow выглядит так:

1. Пользователь открывает документ в существующем document dialog.
2. Если у документа уже есть `documentId`, web создаёт `HocuspocusProvider`.
3. Collab server на `onAuthenticate` вызывает API `GET /documents/:documentId/collaboration`.
4. API возвращает `documentId` и `canEdit`.
5. Collab server открывает `Y.Doc` и поднимает snapshot из памяти, если он уже существует.
6. После `synced` и стабилизации awareness один клиент, выбранный по минимальному `awareness.clientId`, при необходимости делает initial seed persisted `title/body` в общий `Y.Doc`.
7. Tiptap collaboration extension синхронизирует содержимое редактора между клиентами.
8. Awareness state показывает активных участников в UI.
9. Явное сохранение и autosave по-прежнему используют существующий HTTP document API и нормализацию body из `S-5`.

Важно: realtime и persistence документа разведены. Realtime отвечает за совместное состояние редактора, а запись в доменную document model остаётся в существующем save flow.

## Reconnect и устойчивость

В рамках `S-9` реализована базовая устойчивость:

- websocket provider автоматически переподключается;
- collab server хранит актуальный snapshot документа в памяти процесса;
- если клиенты остаются живыми и `collab` перезапускается, они проходят `Reconnecting -> Synced`, а live state продолжает синхронизироваться;
- если все клиенты ушли и затем `collab` был перезапущен, durable CRDT persistence всё ещё отсутствует, поэтому несохранённый collaborative state не гарантирован.

Это соответствует рамкам этапа: reconnect есть, но отдельная durable CRDT persistence ещё не строилась.

## Конфигурация и окружение

Используются переменные окружения:

- `VITE_COLLAB_URL` для web;
- `API_BASE_URL` для collab server;
- существующие `COLLAB_PORT`, `API_PORT`, `VITE_API_BASE_URL`.

В `docker-compose.yml` collab server знает адрес API внутри compose-сети:

- `API_BASE_URL: http://api:${API_PORT:-3001}`

Локальный дефолт для web:

- `ws://localhost:1234`

## Как это соответствует критериям этапа

Этап закрыт по коду, потому что:

- collaboration ограничен документами, а не всем продуктом;
- два клиента могут подключаться к одному документу через общий collab server;
- editor интегрирован с `Yjs/Hocuspocus`;
- presence / awareness отражаются в UI;
- reconnect внутри живого сценария поддерживается;
- модель ролей `owner / editor / viewer` применяется и к collaborative sessions;
- основной document UX не заменён новым экраном и не ломает существующий save flow.

## Тесты и проверка

Локально проверено:

- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/collab typecheck`
- `corepack pnpm --filter @ryba/types build`
- `corepack pnpm --filter @ryba/schemas build`
- `corepack pnpm --filter @ryba/api exec vitest run --config vitest.config.ts test/s8.integration.test.ts test/s9.integration.test.ts`
- `corepack pnpm --filter @ryba/web test`
- `corepack pnpm --filter @ryba/api build`
- `corepack pnpm --filter @ryba/web build`
- `corepack pnpm --filter @ryba/collab build`

Добавлен backend integration test:

- `apps/api/test/s9.integration.test.ts`

Он проверяет:

- collaborative bootstrap для `owner`;
- collaborative bootstrap для `editor`;
- readonly collaborative bootstrap для `viewer`;
- запрет доступа к чужому документу вне workspace.

Добавлены web unit/regression tests:

- `apps/web/src/document-collaboration.test.ts`
- `apps/web/src/document-model.test.ts`

Они проверяют:

- нормализацию websocket URL;
- сбор presence из awareness state;
- статусные подписи collaboration UI;
- defer пустого initial collaboration state;
- deterministic seed-client election;
- что placeholder paragraph не считается renderable persisted body.

Отдельно прогнан live headless smoke против поднятых `api + collab + web`:

- два браузерных клиента;
- открытие одного persisted документа;
- presence обоих участников;
- realtime sync `title` и `body`;
- рестарт `collab` через `docker compose stop/start collab`;
- переход `Reconnecting -> Synced`;
- повторная синхронизация после reconnect.

## Ограничения текущей реализации

В текущую реализацию не входят:

- durable persistence Yjs snapshot в Postgres или отдельном storage;
- realtime synchronization canvas;
- отдельная collaborative permission model поверх workspace roles;
- caret-level collaboration UI с курсорами каждого участника.

Последний пункт сознательно не включён в `S-9`: этап закрыт на presence / awareness indicators без cursor overlays.

## Изменённые файлы

- `docs/S9_DOCUMENT_COLLABORATION_IMPLEMENTATION.md`
- `packages/types/src/document.ts`
- `packages/schemas/src/domain.ts`
- `apps/api/src/documents/documents.service.ts`
- `apps/api/src/documents/documents.controller.ts`
- `apps/api/test/s9.integration.test.ts`
- `apps/collab/src/index.ts`
- `apps/web/src/document-composer.tsx`
- `apps/web/src/document-collaboration.ts`
- `apps/web/src/document-collaboration.test.ts`
- `apps/web/src/document-model.ts`
- `apps/web/src/document-model.test.ts`
- `apps/web/src/entity-document-dialog.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `apps/web/src/vite-env.d.ts`
- `apps/web/package.json`
- `.env.example`
- `docker-compose.yml`
