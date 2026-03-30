# S-1 Technical Research Notes

Date: `2026-03-30`

## Scope

This note records the technical findings for S-1 (technical research) before starting core domain implementation.

Implemented prototypes:

- `apps/web`: React + Vite prototype harness with:
  - React Flow canvas with custom nodes
  - TanStack Table + TanStack Virtual table prototype
  - Tiptap editor prototype with entity token references
- `apps/api`: minimal Nest API with:
  - `GET /health`
  - `GET /db/health` (PostgreSQL probe via `SELECT 1`)
- `apps/collab`: Hocuspocus + Yjs collaboration server with lifecycle logs
- `packages/types`: shared domain types
- `packages/schemas`: shared zod schemas
- Docker setup:
  - `docker-compose.yml` for Postgres/API/Collab/Web
  - app-level Dockerfiles for `api`, `web`, `collab`

## Dev Workflow (Docker Desktop first)

1. Copy `.env.example` to `.env` and adjust if needed.
2. Start infra:
   - `docker compose up -d postgres`
3. Start API + Postgres in Docker:
   - `docker compose up --build -d postgres api`
4. Optional:
   - `docker compose up --build -d collab`
   - `docker compose --profile frontend up --build -d web`
5. Stop all:
   - `docker compose down`

## Findings by Prototype

## Canvas (React Flow)

- Custom node rendering works and supports domain-shaped node payloads.
- Relation edges and viewport controls are straightforward in the current stack.
- Conclusion: keep `reactflow` for S-2/S-3 as the base for canvas exploration.

## Table (TanStack Table + Virtual)

- Virtualized rendering works for larger row sets and keeps DOM/render cost bounded.
- Column + row model ergonomics are sufficient for early saved-view/table work.
- Conclusion: keep `@tanstack/react-table` + `@tanstack/react-virtual`.

## Editor (Tiptap)

- Basic rich text flow is stable.
- Entity references can be represented with lightweight tokens (`[[entity:...]]`) during research.
- Conclusion: keep Tiptap for document layer evolution.

## Collaboration (Yjs + Hocuspocus)

- Minimal server is stable and logs document lifecycle hooks.
- Health checks and startup/shutdown behavior are predictable.
- Conclusion: keep `@hocuspocus/server` + `yjs` for realtime document path.

## API + PostgreSQL

- Nest minimal API works with a simple health layer.
- PostgreSQL connectivity is validated via runtime health probe.
- Dockerized Postgres and API startup on Docker Desktop is straightforward.
- Conclusion: keep Nest + PostgreSQL path for S-2 backend skeleton.

## Exit Criteria Answers (S-1)

- How to store entities: relational table model + typed shape in `packages/types`.
- How to store relations: explicit relation records linking entity IDs.
- How to store canvas layout: separate canvas layout model (`CanvasNodeLayout`, `CanvasEdgeLayout`, `CanvasViewport`) decoupled from entity source of truth.
- How document references entities: textual entity tokens + structured document reference model in shared types.
- How frontend/backend share types: workspace packages `@ryba/types` and `@ryba/schemas`, consumed by both `web` and `api`.
- Libraries that stay:
  - `reactflow`
  - `@tanstack/react-table`
  - `@tanstack/react-virtual`
  - `@tiptap/react` + `@tiptap/starter-kit`
  - `@hocuspocus/server` + `yjs`
  - `@nestjs/*` + `pg`
- Libraries to replace now: none identified at this stage.

## Out-of-Scope Confirmed

Not implemented in S-1:

- auth system
- permissions
- CRM feature layer
- production UI polish
