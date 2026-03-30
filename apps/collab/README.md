# Ryba Collab Prototype

Minimal Hocuspocus + Yjs server for the S-1 technical research stage.

## What This Validates

- WebSocket collaboration server startup
- Document lifecycle hooks and terminal logging
- Basic HTTP health check on the same port
- Docker-friendly container build for local validation

## Local Run

From `apps/collab`:

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm run build
npm run start
npm run typecheck
```

Environment variables:

- `PORT` - server port, default `1234`
- `COLLAB_INSTANCE_NAME` - optional server name for logs
- `PUBLIC_URL` - optional base URL used in HTTP responses

## Validation

After startup, check:

```bash
curl http://localhost:1234/health
```

The server also accepts Hocuspocus WebSocket connections on the same port.

## Docker

Build from the `apps/collab` folder as the Docker context:

```bash
docker build -t ryba-collab -f Dockerfile .
docker run --rm -p 1234:1234 -e PORT=1234 ryba-collab
```

The container listens on `0.0.0.0` and serves the same `/health` endpoint.
