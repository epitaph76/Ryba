# S-10. External Data и Queries

Дата: `2026-04-09`

**Статус:** `done`

## Область работы

Этот документ фиксирует фактическую реализацию этапа `S-10` из `PROJECT_STATUS.md`.

На этом шаге Ryba перестаёт быть только внутренним knowledge-workspace и получает контролируемый data-layer поверх внешнего read-only PostgreSQL:

- в workspace можно подключать внешние источники данных;
- в `space` или `group` можно сохранять параметризованные запросы;
- выполнение запросов идёт через контролируемый runtime, а не через raw SQL-консоль;
- результат появляется прямо внутри продукта как dataset / live table view;
- удачный результат можно встроить обратно в продукт через существующий document flow.

`S-10` сознательно не превращается в ETL-платформу, BI-конструктор общего назначения или write-back интеграцию во внешние системы. Этап закрывает именно controlled read-only querying и встраивание результата в текущие рабочие контексты Ryba.

## Что добавлено

### Shared contracts и schemas

Добавлены отдельные доменные контракты для external data:

- `DataSourceRecord`
- `SavedQueryRecord`
- `QueryRunRecord`
- `QueryResultColumnRecord`
- схемы запросов и ответов для data source, saved query, query execution и publish flow

Дополнительно расширены:

- `ApiErrorCode` / `apiErrorCodeSchema` кодами `QUERY_TIMEOUT` и `EXTERNAL_SOURCE_ERROR`;
- environment schema переменными `EXTERNAL_QUERY_TIMEOUT_MS` и `EXTERNAL_QUERY_MAX_ROWS`.

Это даёт единый typed contract между `packages/types`, `packages/schemas`, API и web для всего S-10 потока.

### Backend

В backend добавлены новые таблицы:

- `data_sources`
- `saved_queries`
- `query_runs`

И новые модули:

- `DataSourcesModule`
- `QueriesModule`

`DataSourcesModule` отвечает за:

- workspace-scoped хранение внешних источников;
- нормализацию и валидацию PostgreSQL connection string;
- проверку, что подключение реально устанавливается;
- возврат наружу только безопасного описания источника без раскрытия секретов;
- activity event `data_source.created`.

`QueriesModule` отвечает за:

- сохранённые запросы на уровне `space` или `group`;
- update / delete saved query;
- execution history;
- публикацию результата в документ;
- activity events `saved_query.created`, `saved_query.updated`, `saved_query.deleted`, `saved_query.executed`, `saved_query.failed`, `saved_query.published`.

### Query execution runtime

В `S-10` query runtime реализован как отдельный контролируемый слой поверх `pg`:

- разрешены только `SELECT` и `WITH`;
- multi-statement SQL запрещён;
- запрещены опасные сценарии наподобие write-операций и небезопасных SQL-конструкций;
- используются именованные параметры вида `{{status}}`, которые компилируются в positional placeholders;
- выполнение идёт в `BEGIN READ ONLY`;
- выставляются `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`;
- применяется row limit через `EXTERNAL_QUERY_MAX_ROWS`;
- результат и ошибка логируются в `query_runs`.

Это даёт воспроизводимый и безопасный saved-query flow вместо произвольного raw SQL.

### Web

Во frontend добавлен новый `ExternalDataPanel`, встроенный в основной `App` рядом с уже существующими `TableView`, document и canvas flow.

В UI появились:

- список подключённых external sources;
- owner-only форма подключения нового PostgreSQL source;
- список saved queries в текущем `space` или `group`;
- редактор SQL template и parameter definitions;
- execution form для runtime параметров;
- история запусков;
- dataset result view;
- действие `Publish to document`.

Важно, что новый слой не живёт отдельным BI-экраном сбоку от продукта: результаты работают внутри уже существующего workspace context, уважают roles из `S-8` и переиспользуют document model из `S-5`.

## API и миграции

Основные новые маршруты:

- `GET /workspaces/:workspaceId/data-sources`
- `POST /workspaces/:workspaceId/data-sources`
- `GET /spaces/:spaceId/saved-queries`
- `POST /spaces/:spaceId/saved-queries`
- `GET /groups/:groupId/saved-queries`
- `POST /groups/:groupId/saved-queries`
- `PATCH /saved-queries/:savedQueryId`
- `DELETE /saved-queries/:savedQueryId`
- `POST /saved-queries/:savedQueryId/execute`
- `GET /saved-queries/:savedQueryId/runs`
- `POST /query-runs/:queryRunId/publish-document`

Для storage layer добавлена Drizzle migration:

- `apps/api/drizzle/0008_funny_millenium_guard.sql`

И соответствующий snapshot в `apps/api/drizzle/meta`.

## Поток данных

Текущий runtime flow выглядит так:

1. Owner подключает read-only PostgreSQL source на уровне workspace.
2. Owner или editor сохраняет query в `space` или `group`.
3. Query описывается через SQL template и именованные параметры.
4. При запуске runtime валидирует SQL, подставляет параметры, выполняет read-only запрос с timeout и row limit.
5. Результат записывается в `query_runs` и показывается в dataset panel.
6. Удачный run можно опубликовать как snapshot в существующую document model.
7. Workspace activity фиксирует ключевые действия, а canvas/document context обновляется без отдельного ручного sync flow.

## Как это соответствует критериям этапа

Этап можно считать закрытым по коду, потому что:

- внешний источник данных подключается внутрь workspace;
- query сохраняется как воспроизводимая сущность, а не как одноразовый SQL-фрагмент;
- исполнение идёт в контролируемом read-only runtime;
- результат виден внутри продукта как dataset view;
- результат можно встроить обратно в документный контекст;
- внешняя БД не получает write-доступа;
- запросы параметризованы, лимитированы и журналируются.

Это соответствует критериям `S-10` из `PROJECT_STATUS.md`: external data не ломают внутреннюю модель Ryba, а интегрируются в уже существующие knowledge + document + group flows.

## Тесты и проверка

Локально проверено:

- `corepack pnpm --filter @ryba/types build`
- `corepack pnpm --filter @ryba/schemas build`
- `corepack pnpm --filter @ryba/api db:migrate`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/api test`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/web test`

Добавлены и обновлены тесты:

- `apps/api/test/s10.integration.test.ts`
- `apps/api/test/sql-template.test.ts`
- `apps/web/src/external-data-model.test.ts`

Отдельно прогнан live headless smoke против поднятого `api + web`:

- вход owner-пользователем через UI;
- подключение external source;
- создание saved query;
- выполнение query;
- отображение dataset в UI;
- публикация результата в document flow;
- подтверждение через API, что документ создан и activity events записаны.

## Что остаётся за рамками S-10

В этот этап не входят:

- поддержка non-PostgreSQL connectors;
- write-доступ во внешние БД;
- произвольная raw SQL-консоль для всех пользователей;
- scheduler / jobs / orchestration;
- полноценная ETL или warehouse pipeline;
- materialized datasets и самостоятельный BI semantic layer.

## Изменённые файлы

- `docs/S10_EXTERNAL_DATA_QUERIES_IMPLEMENTATION.md`
- `packages/types/src/external-data.ts`
- `packages/schemas/src/external-data.ts`
- `apps/api/src/data-sources/data-sources.service.ts`
- `apps/api/src/queries/sql-template.ts`
- `apps/api/src/queries/queries.service.ts`
- `apps/api/test/s10.integration.test.ts`
- `apps/api/test/sql-template.test.ts`
- `apps/web/src/components/ExternalDataPanel.tsx`
- `apps/web/src/external-data-model.ts`
- `apps/web/src/external-data-model.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/canvas-api.ts`
- `apps/web/src/index.css`
- `apps/api/drizzle/0008_funny_millenium_guard.sql`
