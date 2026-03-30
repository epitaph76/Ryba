# Ryba API (S-2)

Core domain backend for S-2 (`PROJECT_STATUS.md`): auth, workspaces, spaces, entities, relations.

## Runtime

- `GET /health`
- `GET /db/health`
- Swagger: `GET /docs`

## Core endpoints

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

## Commands

```bash
pnpm --dir apps/api dev
pnpm --dir apps/api typecheck
pnpm --dir apps/api build
pnpm --dir apps/api test
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:migrate
pnpm --dir apps/api db:studio
```

## Environment

- `API_PORT` (default `3001`)
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN_SECONDS` (default `3600`)
- `API_CORS_ORIGIN` (default `*`)
