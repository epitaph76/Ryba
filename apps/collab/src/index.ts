import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';

const PORT = readPort(process.env.PORT, 1234);
const INSTANCE_NAME = process.env.COLLAB_INSTANCE_NAME ?? 'ryba-collab-prototype';
const ROOT_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const documentSnapshots = new Map<string, Uint8Array>();

interface ApiEnvelopeSuccess<TData> {
  ok: true;
  data: TData;
}

interface ApiEnvelopeFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

interface DocumentCollaborationSessionRecord {
  documentId: string;
  canEdit: boolean;
}

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

function normalizeDocumentName(documentName: string): string {
  const normalized = documentName.trim();

  if (!normalized) {
    throw new Error('Document name is required');
  }

  return normalized;
}

function getApiUrl(pathname: string): string {
  return new URL(pathname, `${API_BASE_URL.replace(/\/+$/, '')}/`).toString();
}

function createSeedDocument(documentName: string, snapshot?: Uint8Array): Y.Doc {
  const document = new Y.Doc();
  const meta = document.getMap('meta');

  meta.set('prototype', 'ryba-collab');
  meta.set('documentName', documentName);

  if (snapshot) {
    Y.applyUpdate(document, snapshot);
  }

  return document;
}

async function fetchCollaborationSession(
  documentId: string,
  token: string,
): Promise<DocumentCollaborationSessionRecord> {
  const response = await fetch(getApiUrl(`/documents/${documentId}/collaboration`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json()) as
    | ApiEnvelopeSuccess<DocumentCollaborationSessionRecord>
    | ApiEnvelopeFailure;

  if (!response.ok || !payload.ok) {
    const message = payload.ok ? response.statusText : `${payload.error.code}: ${payload.error.message}`;
    throw new Error(`Collaboration bootstrap failed for ${documentId}: ${message}`);
  }

  return payload.data;
}
const server = new Server({
  name: INSTANCE_NAME,
  port: PORT,
  timeout: 30_000,
  debounce: 1_500,
  maxDebounce: 5_000,
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
          apiBaseUrl: API_BASE_URL,
          cachedDocuments: documentSnapshots.size,
        });

        reject(undefined);
        return;
      }

      resolve(undefined);
    });
  },
  async onAuthenticate(data) {
    const documentId = normalizeDocumentName(data.documentName);
    const token = data.token.trim();

    if (!token) {
      throw new Error('Missing collaboration token');
    }

    const session = await fetchCollaborationSession(documentId, token);
    data.connectionConfig.readOnly = !session.canEdit;

    return {
      documentId: session.documentId,
      canEdit: session.canEdit,
    };
  },
  async onConnect(data) {
    log(
      `connect document=${data.documentName} socket=${data.socketId} mode=${data.connectionConfig.readOnly ? 'readonly' : 'read-write'}`,
    );
  },
  async onDisconnect(data) {
    log(`disconnect document=${data.documentName} clients=${data.clientsCount} socket=${data.socketId}`);
  },
  async onLoadDocument(data) {
    const documentName = normalizeDocumentName(data.documentName);
    const snapshot = documentSnapshots.get(documentName);

    log(
      `load document=${documentName} snapshot=${snapshot ? 'hit' : 'miss'}${snapshot ? ` bytes=${snapshot.byteLength}` : ''}`,
    );

    return createSeedDocument(documentName, snapshot);
  },
  async onChange(data) {
    const title = data.document.getText('title');
    const content = data.document.getXmlFragment('content');
    log(
      `change document=${data.documentName} bytes=${data.update.byteLength} titleLength=${title.length} contentNodes=${content.length}`,
    );
  },
  async onStoreDocument(data) {
    const snapshot = Y.encodeStateAsUpdate(data.document);
    documentSnapshots.set(data.documentName, snapshot);
    log(
      `store document=${data.documentName} clients=${data.clientsCount} snapshotBytes=${snapshot.byteLength}`,
    );
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
