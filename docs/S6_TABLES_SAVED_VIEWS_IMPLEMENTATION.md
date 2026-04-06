# S-6. Tables и Saved Views

Дата: `2026-04-06`

**Статус:** `done`

## Область работы

Этот документ фиксирует фактическую реализацию этапа `S-6` из `PROJECT_STATUS.md`.

Смысл этапа простой: пространство Ryba теперь можно читать не только как канву, но и как рабочую таблицу с сохранёнными представлениями. Пользователь может собрать нужную выборку, сохранить её как `saved view`, вернуться к ней позже и продолжить работу без ручной настройки заново.

## Что добавлено

### Backend

- добавлена таблица `saved_views` в PostgreSQL;
- реализованы CRUD-эндпоинты для сохранённых представлений;
- добавлена валидация конфигурации saved view на уровне схем и мапперов;
- сохранённые представления привязаны к `space` и к конкретному `entityType`, если тип выбран;
- проверки не позволяют ссылаться на тип сущности из другого workspace.

### Shared layer

- добавлены типы для `SavedViewConfig`, `SavedViewRecord` и связанных payload-ов;
- схемы `saved view` вынесены в `packages/schemas`;
- общий контракт между API и web теперь описывает:
  - фильтры;
  - сортировку;
  - колонки;
  - режим просмотра `table` / `list`.

### Web

- добавлен слой модели таблицы для сборки, нормализации и сериализации draft-конфига;
- реализован интерфейс таблицы с:
  - фильтрами;
  - сортировкой;
  - колонками;
  - переключением `table` / `list`;
  - виртуализацией длинных списков;
- добавлена панель saved views для выбора, создания, обновления, удаления и сброса черновика;
- сохранённое представление можно применить к текущему `space` и восстановить после перезагрузки;
- интерфейс оставлен расширяемым: логика конфига вынесена в `table-model`, а UI-состояние не размазано по `App`.

## API и миграции

Используются такие основные точки:

- `GET /spaces/:spaceId/saved-views`
- `POST /spaces/:spaceId/saved-views`
- `PATCH /saved-views/:savedViewId`
- `DELETE /saved-views/:savedViewId`

Для хранения состояния добавлена новая миграция Drizzle и соответствующий snapshot в `apps/api/drizzle/meta`.

## Как это соответствует критериям этапа

Этап считается закрытым, потому что:

- таблица сущностей реально открывается как рабочая линза, а не как сырой список;
- пользователь может сохранять и повторно открывать набор фильтров, сортировки и колонок;
- конфигурация saved view живёт на сервере, а не только в памяти браузера;
- модель не ломается на типизированных сущностях и на смене `space`;
- есть проверка на cross-workspace ошибки;
- web и api используют общий типизированный контракт.

## Тесты и проверка

Проверено локально:

- `corepack pnpm --filter @ryba/api db:migrate`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/api test -- test/s6.integration.test.ts`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/web test -- src/table-model.test.ts`
- `corepack pnpm --filter @ryba/web build`

Покрытие сейчас держится на:

- `apps/api/test/s6.integration.test.ts`
- `apps/web/src/table-model.test.ts`
- общих типах и схемах в `packages/types` и `packages/schemas`

## Что остаётся за рамками S-6

В этот этап не входят:

- groups как subspaces;
- permission model;
- advanced CRM workflows;
- внешние data sources и dataset/query result слой;
- усложнение таблицы до spreadsheet- или BI-платформы;
- полный redesign canvas UX.

## Изменённые файлы

- `docs/S6_TABLES_SAVED_VIEWS_IMPLEMENTATION.md`
