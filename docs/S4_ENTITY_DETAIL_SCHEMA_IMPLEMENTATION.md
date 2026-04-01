# S-4. Entity Detail и Schema Layer

Дата: `2026-04-01`

**Статус:** `done`

## Область работы

Этот документ фиксирует завершённую реализацию этапа `S-4` из `PROJECT_STATUS.md`.

На этом шаге проект уходит от безликих объектов к типизированным сущностям и schema-aware detail workflow:

- entity types;
- field definitions;
- typed entity values;
- runtime validation по schema;
- helper-слой для detail view и schema editor на web.

Что подтверждено в коде и тестах:

- в PostgreSQL появились `entity_types` и `entity_type_fields`;
- в `entities` добавлен `entityTypeId`;
- workspace creation seed-ит базовые типы `Company`, `Contact`, `Task`, `Note`, `Project`;
- `apps/api` валидирует entity properties по полям выбранного типа;
- `apps/web` получил pure helper-модели, встроенные панели `Schema layer` и `Detail view` на основном экране, а также новый API-клиент под S-4 операции.

## Что вне scope

S-4 не пытается сразу стать мета-платформой.

Из этого этапа намеренно исключены:

- formulas;
- rollups;
- automations;
- enterprise-calculated fields;
- permission model;
- document layer;
- saved views и tables;
- deep relation/user lookup UX;
- UI-polish раньше функциональной целостности.

## Архитектура хранения

Текущий storage-слой устроен так:

- `entity_types` хранит тип сущности на уровне workspace;
- `entity_type_fields` хранит schema полей и их конфиг;
- `entities.entityTypeId` связывает конкретную запись с типом;
- `entities.properties` остаётся JSONB-хранилищем actual values;
- поле `isSystem` отличает seed-тип от пользовательского.

Это даёт нормальный record layer без отдельного EAV-слоя:

- schema живёт отдельно от values;
- values остаются компактными и читаемыми;
- validation выполняется на runtime в API;
- типы можно расширять без перестройки всей модели данных.

### Entity types

`EntityTypeRecord` сейчас содержит:

- `id`;
- `workspaceId`;
- `name`;
- `slug`;
- `description`;
- `color`;
- `icon`;
- `isSystem`;
- `fields`;
- timestamps.

### Field definitions

`EntityTypeFieldRecord` сейчас содержит:

- `id`;
- `workspaceId`;
- `entityTypeId`;
- `key`;
- `label`;
- `fieldType`;
- `description`;
- `required`;
- `order`;
- `config`;
- timestamps.

`config` используется для:

- `options` у `select`, `status`, `multi_select`;
- `allowMultiple` у `relation`, `user` и `multi_select`;
- `relationEntityTypeId` у relation-полей;
- `placeholder` там, где он нужен.

### Typed values

`entities.properties` хранит значения полей как JSONB, но запись проходит нормализацию:

- `text`, `rich_text`, `select`, `status`, `url` хранятся как строки;
- `number` хранится как finite number;
- `boolean` хранится как boolean;
- `date` хранится как ISO-совместимая строка;
- `multi_select` хранится как массив строк;
- `relation` и `user` поддерживают одиночное или множественное значение через `allowMultiple`.

## API слой

Сейчас schema-layer API уже существует как набор обычных REST endpoints:

- `GET /workspaces/:workspaceId/entity-types`
- `POST /workspaces/:workspaceId/entity-types`
- `PATCH /entity-types/:entityTypeId`
- `GET /entities/:entityId`
- `POST /spaces/:spaceId/entities`
- `PATCH /entities/:entityId`

Detail workflow на клиенте строится поверх этих ответов и workspace-level schema списка.

Важно:

- отдельного `detail endpoint` пока нет;
- detail workflow собирается из `entity`, `entity types` и `field definitions`;
- это оставляет API проще и не раздувает S-4 раньше времени.

## UI слой

Фронтенд уже получил не только helper-слои, но и встроенный в основной экран S-4 workflow.

Что есть сейчас:

- `apps/web/src/App.tsx` содержит видимые панели `Schema layer` и `Detail view` внутри основного canvas-экрана;
- `apps/web/src/canvas-api.ts` умеет работать с entity type CRUD и entity update;
- `apps/web/src/entity-detail-model.ts` собирает detail draft, schema draft и сериализует их обратно в payload;
- `apps/web/src/entity-schema-model.ts` остаётся отдельной pure model для schema/editor сценариев и покрыт тестами;
- `apps/web/src/field-renderers.ts` нормализует, форматирует и сериализует field values;
- карточки канвы показывают `entityTypeName`, а detail view позволяет менять тип записи и редактировать typed fields;
- schema layer позволяет создавать и редактировать типы, поля, required-флаги, options и relation-конфиг.

Что это значит practically:

- schema editor и detail editor уже не только описаны кодом, но и доступны в рабочем UI;
- рендеринг полей строится поверх общих helper-функций и не размазан по интерфейсу;
- текущий S-3 canvas shell остаётся навигационной точкой, а S-4 слой уже встроен в видимый экран как следующий рабочий уровень.

## Проверка

Для локальной проверки S-4 используются:

- `docker compose up -d postgres`
- `corepack pnpm db:migrate`
- `corepack pnpm --dir packages/types typecheck`
- `corepack pnpm --dir packages/types build`
- `corepack pnpm --dir packages/schemas typecheck`
- `corepack pnpm --dir packages/schemas build`
- `corepack pnpm --filter @ryba/api test`
- `corepack pnpm --filter @ryba/web test`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`

Новые тесты для этого этапа:

- `apps/api/test/s4.integration.test.ts`
- `apps/web/src/entity-detail-model.test.ts`
- `apps/web/src/entity-schema-model.test.ts`
- `apps/web/src/field-renderers.test.ts`

## Следующий шаг

После завершения S-4 следующий этап в roadmap - `S-5 Documents и narrative layer`.

Это логично продолжает текущую линию:

- сначала типизированный record layer;
- потом документный слой, который начинает связывать мысль и структуру;
- затем уже tables, subspaces, permissions и realtime.
