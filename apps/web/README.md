# Ryba web prototype

This package is the S-1 technical research surface for Ryba.

## What it validates

- `Canvas`: React Flow with custom nodes and sample relations.
- `Table`: TanStack Table with TanStack Virtual for long row sets.
- `Editor`: Tiptap Starter Kit with a small entity-reference metadata concept.
- `Core S-2`: Minimal integration with API auth/workspace/space/entity/relation flow.

## Run locally

```bash
pnpm --dir apps/web install
pnpm --dir apps/web dev
```

## Build checks

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
```

## Docker

Build from the repository root (required, because `@ryba/types` is a workspace dependency):

```bash
docker build -t ryba-web -f apps/web/Dockerfile .
docker run --rm -p 4173:80 ryba-web
```

The container serves the built static app on container port `80`.
