# Ryba web prototype

This package is the S-1 technical research surface for Ryba.

## What it validates

- `Canvas`: React Flow with custom nodes and sample relations.
- `Table`: TanStack Table with TanStack Virtual for long row sets.
- `Editor`: Tiptap Starter Kit with a small entity-reference metadata concept.

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

Build from the repository root with `apps/web` as the Docker context:

```bash
docker build -t ryba-web apps/web
docker run --rm -p 4173:4173 ryba-web
```

The container serves the built preview on port `4173`.
