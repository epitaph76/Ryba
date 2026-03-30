# Ryba API

Minimal NestJS API for the technical research stage.

What it exposes:
- `GET /health`
- `GET /db/health`

Environment:
- `API_PORT` controls the listening port and defaults to `3001`
- `DATABASE_URL` enables the database health check

Commands:
- `pnpm --dir apps/api dev`
- `pnpm --dir apps/api build`
- `pnpm --dir apps/api typecheck`
- `pnpm --dir apps/api start`

Docker:
- build: `docker build -f apps/api/Dockerfile .`
- run: `docker run --rm -p 3001:3001 -e API_PORT=3001 -e DATABASE_URL=postgres://... ryba-api`

For local Postgres, use Docker Desktop or a plain `postgres:16-alpine` container and point `DATABASE_URL` at it.
