# S-2. Заметки по реализации core domain

Дата: `2026-03-30`

## Область работы

Этот документ фиксирует фактическую реализацию этапа `S-2` из `PROJECT_STATUS.md`:

- backend core domain (`auth`, `workspaces`, `spaces`, `entities`, `relations`);
- JWT-аутентификацию в минимальном виде, без refresh token / OAuth / RBAC;
- PostgreSQL-схему и миграции Drizzle;
- общие контракты в `@ryba/types` и `@ryba/schemas`;
- минимальный web-интерфейс для проверки end-to-end сценария.

Что не входило в `S-2`:

- продуктовый слой канвы (`S-3`);
- документы, таблицы, внешние данные и CRM;
- permission model как отдельный слой;
- production-polish интерфейса.

## Реализованная архитектура

### Основа API

- NestJS + Fastify adapter;
- OpenAPI / Swagger по адресу `GET /docs`;
- глобальный формат ошибки (`ApiEnvelope`) с кодами:
  - `VALIDATION_ERROR`
  - `NOT_FOUND`
  - `CONFLICT`
  - `UNAUTHORIZED`
  - `FORBIDDEN`
  - `INTERNAL_ERROR`
- JWT guard для всех core-endpoints, кроме `/auth/*`;
- runtime-валидация через общие Zod-схемы.

### Основные эндпоинты

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /workspaces`
- `GET /workspaces`
- `POST /workspaces/:workspaceId/spaces`
- `GET /workspaces/:workspaceId/spaces`
- `POST /spaces/:spaceId/entities`
- `GET /spaces/:spaceId/entities`
- `GET /entities/:entityId`
- `PATCH /entities/:entityId`
- `DELETE /entities/:entityId`
- `POST /spaces/:spaceId/relations`
- `GET /spaces/:spaceId/relations`
- `PATCH /relations/:relationId`
- `DELETE /relations/:relationId`

## Слой данных (PostgreSQL + Drizzle)

### Таблицы

- `users`
- `workspaces`
- `workspace_members`
- `spaces`
- `entities`
- `relations`

### Ограничения

- `users.email` уникален;
- `workspace_members(workspace_id, user_id)` уникален;
- цепочка внешних ключей:
  - `spaces.workspace_id -> workspaces.id`
  - `entities.workspace_id -> workspaces.id`
  - `entities.space_id -> spaces.id`
  - `relations.workspace_id -> workspaces.id`
  - `relations.space_id -> spaces.id`
  - `relations.from_entity_id -> entities.id`
  - `relations.to_entity_id -> entities.id`

### Индексы

- `entities(workspace_id)`
- `entities(space_id)`
- `relations(workspace_id)`
- `relations(space_id)`
- `relations(from_entity_id)`
- `relations(to_entity_id)`

Артефакт миграции:

- `apps/api/drizzle/0000_perfect_greymalkin.sql`

## Интеграция веба

В `apps/web` был добавлен отдельный интерфейс для проверки `S-2`:

- регистрация и вход;
- создание и просмотр workspace;
- создание и просмотр space;
- создание и просмотр entity;
- создание и просмотр relation;
- панель журнала действий.

Токен хранится в `localStorage` под ключом `ryba_s2_access_token` для dev-проверки.

## Тестирование и валидация

### Запущенные автоматические проверки

- `pnpm --filter @ryba/types typecheck`
- `pnpm --filter @ryba/schemas typecheck`
- `pnpm --filter @ryba/api typecheck`
- `pnpm --filter @ryba/web typecheck`
- `pnpm --filter @ryba/web build`
- `pnpm --filter @ryba/api test`
- `pnpm build`

### Интеграционные тесты API (`apps/api/test/s2.integration.test.ts`)

Покрытые сценарии:

1. Полный поток: `register -> workspace -> space -> entity -> relation -> list`.
2. Ошибка валидации, если relation ссылается на несуществующую сущность.
3. Запрет доступа между разными workspace (`FORBIDDEN`).
4. Проверка контрактов через общие Zod-схемы на runtime-ответах.

## Как запустить и проверить локально

1. Установить зависимости:

```bash
corepack pnpm install
```

2. Подготовить env:

```bash
copy .env.example .env
```

3. Поднять PostgreSQL:

```bash
docker compose up -d postgres
```

4. Применить миграции:

```bash
corepack pnpm db:migrate
```

5. Запустить API:

```bash
corepack pnpm --filter @ryba/api dev
```

6. Запустить web:

```bash
corepack pnpm --filter @ryba/web dev
```

7. Проверить вручную:

- открыть `http://localhost:3001/docs`;
- открыть `http://localhost:5173`;
- в вебе пройти сценарий:
  - зарегистрироваться или войти;
  - создать workspace;
  - создать space;
  - создать 2 сущности;
  - создать relation;
  - проверить список entities и relations.

8. Запустить автоматические тесты:

```bash
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ryba'
$env:JWT_SECRET='change-me-s2-tests'
corepack pnpm --filter @ryba/api test
```

## Следующий шаг

После завершения `S-2` правильный следующий этап: `S-3`, то есть базовая канва поверх реальных сущностей и связей.
