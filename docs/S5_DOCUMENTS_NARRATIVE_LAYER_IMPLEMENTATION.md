# S-5. Documents и Narrative Layer

Дата: `2026-04-01`

**Статус:** `done`

## Область работы

Этот документ фиксирует завершённую реализацию этапа `S-5` из `PROJECT_STATUS.md`.

На этом шаге проект получает document/narrative слой вокруг существующих `entities`:

- persisted rich text документы;
- entity mentions внутри текста;
- backlinks от сущности к документам, где она упомянута;
- linked entity previews рядом с документом;
- отдельный model-слой сериализации документа на web.

Что подтверждено в коде и тестах:

- в PostgreSQL появились `documents` и `document_entity_mentions`;
- `apps/api` получил `DocumentsModule` и REST-first API для document flow;
- `apps/web` получил встроенный document view на Tiptap внутри основного рабочего экрана;
- mentions и document serialization вынесены в отдельный helper/model-слой и покрыты тестами.

## Что вне scope

S-5 не пытается закрыть весь collaborative editor сразу.

Из этого этапа намеренно исключены:

- range comments;
- version history;
- финальный collaboration UX;
- threaded discussions;
- полноценная rich media / embed platform;
- tables, saved views, groups и permission model.

## Архитектура хранения

Текущий document storage слой устроен так:

- `documents` хранит сам документ на уровне `workspace + space`;
- `documents.body` хранит сериализованный список `DocumentBlock[]`;
- `documents.previewText` хранит краткий preview для списков и backlinks;
- `document_entity_mentions` хранит все ссылки документа на сущности;
- mentions валидируются относительно сущностей того же `workspace` и `space`.

Это даёт простой и расширяемый baseline:

- документ живёт как отдельный narrative-слой, но не отрывается от core domain;
- backlinks не вычисляются ad-hoc на клиенте, а доступны как отдельный API-сценарий;
- сериализация документа остаётся контролируемой;
- позже можно заменить token-based mentions на richer node/extension, не ломая весь слой хранения.

### Document record

`DocumentRecord` сейчас содержит:

- `id`;
- `workspaceId`;
- `spaceId`;
- `title`;
- `body`;
- `previewText`;
- `createdByUserId`;
- `updatedByUserId`;
- timestamps.

### Mentions и backlinks

`DocumentEntityReference` и `DocumentBacklinkRecord` покрывают две стороны одной связи:

- в документе mention связывает текст с `entityId`;
- у сущности backlinks показывают документы, где она упоминается;
- preview строится вокруг readable `previewText`, а не raw storage JSON.

## API слой

S-5 document API реализован как обычный REST-набор:

- `GET /spaces/:spaceId/documents`
- `POST /spaces/:spaceId/documents`
- `GET /documents/:documentId`
- `PATCH /documents/:documentId`
- `GET /entities/:entityId/document-backlinks`

Что важно:

- список документов отдаётся на уровне `space`;
- создание и обновление документа валидируют mentions по `entities` того же пространства;
- detail response возвращает сам документ и previews упомянутых сущностей;
- backlinks читаются от entity, а не вычисляются вручную во view-слое.

## UI слой

Фронтенд получил встроенный document workflow внутри основного `apps/web/src/App.tsx`.

Что есть сейчас:

- отдельная панель `Documents` рядом с канвой и detail/schema panels;
- `DocumentComposer` на базе Tiptap StarterKit и placeholder-логики;
- вставка mentions через entity picker в toolbar;
- загрузка и сохранение документа через `canvas-api.ts`;
- linked entity previews рядом с документом;
- backlinks внутри `Detail view` выбранной сущности;
- отдельный `document-model.ts` для сериализации editor JSON в `DocumentBlock[]` и обратно.

Что это значит practically:

- documents уже не живут как отдельный технический prototype;
- narrative и structured layer доступны в одном рабочем экране;
- пользователь может писать текст и сразу связывать его с предметными объектами;
- слой уже пригоден как knowledge workspace baseline, не дожидаясь realtime.

## Проверка

Для локальной проверки S-5 использовались:

- `docker compose up -d postgres`
- `corepack pnpm db:migrate`
- `corepack pnpm --dir packages/types typecheck`
- `corepack pnpm --dir packages/types build`
- `corepack pnpm --dir packages/schemas typecheck`
- `corepack pnpm --dir packages/schemas build`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/web test`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/api test`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`

Новые тесты для этого этапа:

- `apps/api/test/s5.integration.test.ts`
- `apps/web/src/document-model.test.ts`

## Следующий шаг

После завершения S-5 следующий логичный этап roadmap - `S-6`, то есть `Tables и Saved Views`.

Это продолжает текущую линию:

- сначала типизированный record layer;
- затем narrative/document layer;
- потом структурированная tabular lens для daily work поверх уже существующих entities и documents.
