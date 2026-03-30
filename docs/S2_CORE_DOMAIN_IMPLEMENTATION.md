# S-2 Core Domain Implementation Notes

Date: `2026-03-30`

## Scope

This document фиксирует фактическую реализацию этапа `S-2` из `PROJECT_STATUS.md`:

- backend core domain (`auth`, `workspaces`, `spaces`, `entities`, `relations`);
- JWT auth (minimal, без refresh token/OAuth/RBAC);
- PostgreSQL schema + Drizzle migrations;
- shared contracts в `@ryba/types` и `@ryba/schemas`;
- минимальный web-интерфейс для проверки end-to-end сценария.

Out of scope (не реализовано в S-2):

- canvas product layer (`S-3`);
- documents/tables/external data/CRM;
- permission model как отдельный слой;
- production UI polish.

## Delivered Architecture

### API foundation

- NestJS + Fastify adapter
- OpenAPI/Swagger: `GET /docs`
- Global error envelope (`ApiEnvelope`) with codes:
  - `VALIDATION_ERROR`
  - `NOT_FOUND`
  - `CONFLICT`
  - `UNAUTHORIZED`
  - `FORBIDDEN`
  - `INTERNAL_ERROR`
- JWT guard для всех core endpoints, кроме `/auth/*`
- runtime validation через shared Zod schemas

### Core endpoints

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

## Data Layer (PostgreSQL + Drizzle)

### Tables

- `users`
- `workspaces`
- `workspace_members`
- `spaces`
- `entities`
- `relations`

### Constraints

- `users.email` unique
- `workspace_members(workspace_id, user_id)` unique
- FK chain:
  - `spaces.workspace_id -> workspaces.id`
  - `entities.workspace_id -> workspaces.id`
  - `entities.space_id -> spaces.id`
  - `relations.workspace_id -> workspaces.id`
  - `relations.space_id -> spaces.id`
  - `relations.from_entity_id -> entities.id`
  - `relations.to_entity_id -> entities.id`

### Indexes

- `entities(workspace_id)`
- `entities(space_id)`
- `relations(workspace_id)`
- `relations(space_id)`
- `relations(from_entity_id)`
- `relations(to_entity_id)`

Migration artifact:

- `apps/api/drizzle/0000_perfect_greymalkin.sql`

## Web Integration (minimal)

`apps/web` получил отдельную вкладку **Core S-2**:

- register/login
- create/list workspace
- create/list space
- create/list entity
- create/list relation
- action log panel

Token storage: `localStorage` (`ryba_s2_access_token`) for dev verification.

## Testing and Validation

### Automated checks run

- `pnpm --filter @ryba/types typecheck`
- `pnpm --filter @ryba/schemas typecheck`
- `pnpm --filter @ryba/api typecheck`
- `pnpm --filter @ryba/web typecheck`
- `pnpm --filter @ryba/web build`
- `pnpm --filter @ryba/api test`
- `pnpm build`

### API integration tests (`apps/api/test/s2.integration.test.ts`)

Covered scenarios:

1. Full flow: `register -> workspace -> space -> entity -> relation -> list`.
2. Validation error when relation references non-existing entity.
3. Cross-workspace access denied (`FORBIDDEN`).
4. Contract parse checks with shared Zod schemas on runtime responses.

## How to Run and Test Locally

1. Install dependencies:

```bash
corepack pnpm install
```

2. Prepare env:

```bash
copy .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

4. Apply migrations:

```bash
corepack pnpm db:migrate
```

5. Start API:

```bash
corepack pnpm --filter @ryba/api dev
```

6. Start web:

```bash
corepack pnpm --filter @ryba/web dev
```

7. Verify manually:

- open `http://localhost:3001/docs`
- open `http://localhost:5173`
- in web choose **Core S-2** tab and run flow:
  - register/login
  - create workspace
  - create space
  - create 2 entities
  - create relation
  - verify entities/relations list

8. Run automated tests:

```bash
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ryba'
$env:JWT_SECRET='change-me-s2-tests'
corepack pnpm --filter @ryba/api test
```

## Next Step

After S-2 completion, correct next phase is `S-3` (base canvas on top of real core entities and relations).
