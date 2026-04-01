# S-3 Base Canvas Implementation Notes

Date: `2026-04-01`

## Scope

This note records the delivered implementation of `S-3` from `PROJECT_STATUS.md`:

- real canvas view on top of `spaces`, `entities`, and `relations`;
- separate persistence for canvas layout, independent from domain source of truth;
- minimal canvas-focused web workflow for creating entities and relations;
- canvas API contracts, shared types, and automated checks.

Out of scope for `S-3`:

- entity schema designer and typed field system (`S-4`);
- document layer, tables, saved views, and external data;
- realtime canvas collaboration;
- advanced auto-layout or whiteboard functionality.

## Delivered Architecture

### API and persistence

- Added `space_canvas_states` table in PostgreSQL.
- Added `CanvasModule` in `apps/api`.
- Added endpoints:
  - `GET /spaces/:spaceId/canvas`
  - `PUT /spaces/:spaceId/canvas`
- Canvas layout is stored separately from `entities` and `relations`.
- `GET /spaces/:spaceId/canvas` returns a usable default state even when no saved layout exists yet.
- `PUT /spaces/:spaceId/canvas` validates:
  - every node references an existing entity in the same space;
  - every edge references an existing relation in the same space;
  - edge endpoints match the relation source/target pair.

### Shared contracts

Added/expanded shared canvas contracts in `@ryba/types` and `@ryba/schemas`:

- `CanvasLayout`
- `CanvasStateInput`
- `CanvasStateRecord`
- `canvasViewportSchema`
- `canvasLayoutSchema`
- `canvasStateRecordSchema`
- `saveCanvasStateRequestSchema`

The agreed S-3 contract is:

- `GET /spaces/:spaceId/canvas -> CanvasStateRecord`
- `PUT /spaces/:spaceId/canvas -> CanvasStateRecord`

Where `CanvasStateRecord` contains:

- `spaceId`
- `nodes`
- `edges`
- `viewport`
- `updatedAt`

### Web canvas

`apps/web` now exposes a working S-3 screen instead of the isolated prototype harness.

Implemented capabilities:

- auth flow using the real API;
- workspace and space selection;
- loading real entities, relations, and canvas layout;
- rendering entity cards as React Flow nodes;
- rendering relations as graph edges;
- drag/drop, zoom, pan, and selection;
- double-click on the canvas to create an entity;
- connect handles to create a relation;
- manual layout save through the canvas API;
- minimal entity inspector panel.

### Interaction model

The current S-3 UX deliberately stays minimal:

- canvas is a navigation lens, not the source of truth;
- layout changes are explicit and persistable;
- entity creation can start from the canvas;
- relation creation uses direct node-to-node connect interaction;
- detail view is intentionally shallow and stops before `S-4`.

## Testing and Validation

### Automated checks run

- `corepack pnpm db:migrate`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/web test`
- `corepack pnpm --filter @ryba/web build`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/api test`
- `corepack pnpm build`
- `corepack pnpm test`
- `corepack pnpm typecheck`

Note: local runs emitted an engine warning because the current machine used Node `24.x`, while the repo declares `>=22 <23`. The checks above still completed successfully.

### API integration tests

`apps/api/test/s3.integration.test.ts` covers:

1. default canvas state generation from real entities and relations;
2. save/load roundtrip for `PUT/GET /spaces/:spaceId/canvas`;
3. workspace isolation for canvas access.

`apps/api/test/s2.integration.test.ts` remains green alongside S-3.

### Web unit tests

`apps/web/src/canvas-model.test.ts` covers:

1. mapping API entities/relations/canvas state into React Flow graph data;
2. serializing the current graph back into the API canvas payload.

## How to Run and Verify Locally

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

- open `http://localhost:5173`
- register or log in;
- create workspace and space;
- open the canvas;
- double-click the canvas to create entities;
- connect nodes to create a relation;
- drag nodes and save layout;
- refresh the canvas and verify the layout is restored.

## Next Step

After `S-3`, the correct next phase is `S-4`: entity detail and schema layer on top of the now-working canvas navigation model.
