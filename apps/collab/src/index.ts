import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';

const PORT = readPort(process.env.PORT, 1234);
const INSTANCE_NAME = process.env.COLLAB_INSTANCE_NAME ?? 'ryba-collab-prototype';
const ROOT_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

function readPort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  // Keep logs compact so prototype behavior is easy to scan in terminal output.
  console.log(`[collab ${timestamp}] ${message}`);
}

function jsonResponse(response: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void }, body: Record<string, unknown>): void {
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

const server = new Server({
  name: INSTANCE_NAME,
  port: PORT,
  timeout: 30_000,
  quiet: true,
  async onListen({ port }) {
    log(`listening on ws://0.0.0.0:${port}`);
    log(`health check available at ${ROOT_URL}/health`);
  },
  onRequest({ request, response }) {
    return new Promise<void>((resolve, reject) => {
      const requestUrl = new URL(request.url ?? '/', ROOT_URL);

      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        jsonResponse(response, {
          status: 'ok',
          service: INSTANCE_NAME,
          port: PORT,
          time: new Date().toISOString(),
        });

        reject(undefined);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/') {
        jsonResponse(response, {
          service: INSTANCE_NAME,
          routes: ['/health'],
          websocket: `ws://localhost:${PORT}`,
        });

        reject(undefined);
        return;
      }

      resolve(undefined);
    });
  },
  async onConnect(data) {
    log(`connect document=${data.documentName} socket=${data.socketId}`);
  },
  async onDisconnect(data) {
    log(`disconnect document=${data.documentName} clients=${data.clientsCount} socket=${data.socketId}`);
  },
  async onLoadDocument(data) {
    const document = new Y.Doc();
    const meta = document.getMap('meta');
    meta.set('prototype', 'ryba-collab');
    meta.set('documentName', data.documentName);
    log(`load document=${data.documentName}`);
    return document;
  },
  async onChange(data) {
    const content = data.document.getText('content');
    log(`change document=${data.documentName} bytes=${data.update.byteLength} contentLength=${content.length}`);
  },
  async onStoreDocument(data) {
    log(`store document=${data.documentName} clients=${data.clientsCount}`);
  },
  async afterUnloadDocument(data) {
    log(`unload document=${data.documentName}`);
  },
});

server.listen();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    log(`received ${signal}, shutting down`);
    await server.destroy();
    process.exit(0);
  });
}
