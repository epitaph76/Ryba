import { useEffect, useMemo, useState } from 'react';
import type {
  ApiEnvelope,
  AuthSession,
  EntityRecord,
  RelationRecord,
  SpaceRecord,
  UserRecord,
  WorkspaceRecord,
} from '@ryba/types';
import { PrototypeChrome } from './PrototypeChrome';

type ListResponse<TItem> = { items: TItem[] };

const TOKEN_STORAGE_KEY = 'ryba_s2_access_token';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3001';

async function request<TData>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<TData> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const json = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok || !json.ok) {
    const message = json.ok
      ? `HTTP ${response.status}`
      : `${json.error.code}: ${json.error.message}`;
    throw new Error(message);
  }

  return json.data;
}

export function CoreDomainPrototype() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [spaces, setSpaces] = useState<SpaceRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [email, setEmail] = useState('demo@ryba.local');
  const [password, setPassword] = useState('Password123');
  const [displayName, setDisplayName] = useState('Demo User');
  const [workspaceName, setWorkspaceName] = useState('Demo Workspace');
  const [workspaceSlug, setWorkspaceSlug] = useState('demo-workspace');
  const [spaceName, setSpaceName] = useState('General');
  const [spaceSlug, setSpaceSlug] = useState('general');
  const [entityTitle, setEntityTitle] = useState('New entity');
  const [entitySummary, setEntitySummary] = useState('S-2 entity from web prototype');
  const [relationType, setRelationType] = useState('related_to');
  const [relationFromId, setRelationFromId] = useState('');
  const [relationToId, setRelationToId] = useState('');
  const [busy, setBusy] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );
  const selectedSpace = useMemo(
    () => spaces.find((item) => item.id === spaceId) ?? null,
    [spaces, spaceId],
  );

  const appendLog = (message: string) => {
    setLogLines((prev) => [`${new Date().toLocaleTimeString()} ${message}`, ...prev].slice(0, 20));
  };

  const syncSession = (session: AuthSession) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, session.accessToken);
    setToken(session.accessToken);
    setCurrentUser(session.user);
    appendLog(`Authenticated as ${session.user.email}`);
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setWorkspaces([]);
    setSpaces([]);
    setEntities([]);
    setRelations([]);
    setWorkspaceId('');
    setSpaceId('');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      appendLog(error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setBusy(false);
    }
  };

  const loadMe = async (activeToken: string) => {
    const me = await request<UserRecord>('/auth/me', { method: 'GET' }, activeToken);
    setCurrentUser(me);
  };

  const loadWorkspaces = async (activeToken: string) => {
    const data = await request<ListResponse<WorkspaceRecord>>('/workspaces', { method: 'GET' }, activeToken);
    setWorkspaces(data.items);
    if (!workspaceId && data.items[0]) {
      setWorkspaceId(data.items[0].id);
    }
  };

  const loadSpaces = async (activeToken: string, targetWorkspaceId: string) => {
    const data = await request<ListResponse<SpaceRecord>>(
      `/workspaces/${targetWorkspaceId}/spaces`,
      { method: 'GET' },
      activeToken,
    );
    setSpaces(data.items);
    if (!spaceId && data.items[0]) {
      setSpaceId(data.items[0].id);
    }
  };

  const loadEntities = async (activeToken: string, targetSpaceId: string) => {
    const data = await request<ListResponse<EntityRecord>>(
      `/spaces/${targetSpaceId}/entities`,
      { method: 'GET' },
      activeToken,
    );
    setEntities(data.items);
    if (!relationFromId && data.items[0]) {
      setRelationFromId(data.items[0].id);
    }
    if (!relationToId && data.items[1]) {
      setRelationToId(data.items[1].id);
    }
  };

  const loadRelations = async (activeToken: string, targetSpaceId: string) => {
    const data = await request<ListResponse<RelationRecord>>(
      `/spaces/${targetSpaceId}/relations`,
      { method: 'GET' },
      activeToken,
    );
    setRelations(data.items);
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    run(async () => {
      await loadMe(token);
      await loadWorkspaces(token);
    });
  }, [token]);

  useEffect(() => {
    if (!token || !workspaceId) {
      return;
    }

    run(async () => {
      await loadSpaces(token, workspaceId);
    });
  }, [workspaceId, token]);

  useEffect(() => {
    if (!token || !spaceId) {
      return;
    }

    run(async () => {
      await Promise.all([loadEntities(token, spaceId), loadRelations(token, spaceId)]);
    });
  }, [spaceId, token]);

  const authenticateRegister = () =>
    run(async () => {
      const session = await request<AuthSession>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            displayName,
          }),
        },
      );
      syncSession(session);
    });

  const authenticateLogin = () =>
    run(async () => {
      const session = await request<AuthSession>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
          }),
        },
      );
      syncSession(session);
    });

  const createWorkspace = () =>
    run(async () => {
      if (!token) return;
      const workspace = await request<WorkspaceRecord>(
        '/workspaces',
        {
          method: 'POST',
          body: JSON.stringify({
            name: workspaceName,
            slug: workspaceSlug,
          }),
        },
        token,
      );
      appendLog(`Workspace created: ${workspace.slug}`);
      await loadWorkspaces(token);
      setWorkspaceId(workspace.id);
    });

  const createSpace = () =>
    run(async () => {
      if (!token || !workspaceId) return;
      const space = await request<SpaceRecord>(
        `/workspaces/${workspaceId}/spaces`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: spaceName,
            slug: spaceSlug,
          }),
        },
        token,
      );
      appendLog(`Space created: ${space.slug}`);
      await loadSpaces(token, workspaceId);
      setSpaceId(space.id);
    });

  const createEntity = () =>
    run(async () => {
      if (!token || !spaceId) return;
      const entity = await request<EntityRecord>(
        `/spaces/${spaceId}/entities`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: entityTitle,
            summary: entitySummary || null,
            properties: {},
          }),
        },
        token,
      );
      appendLog(`Entity created: ${entity.title}`);
      await loadEntities(token, spaceId);
    });

  const createRelation = () =>
    run(async () => {
      if (!token || !spaceId || !relationFromId || !relationToId) return;
      const relation = await request<RelationRecord>(
        `/spaces/${spaceId}/relations`,
        {
          method: 'POST',
          body: JSON.stringify({
            fromEntityId: relationFromId,
            toEntityId: relationToId,
            relationType,
            properties: {},
          }),
        },
        token,
      );
      appendLog(`Relation created: ${relation.relationType}`);
      await loadRelations(token, spaceId);
    });

  return (
    <PrototypeChrome
      title="Core S-2 integration"
      summary="Minimal web flow for S-2: JWT auth, workspace/space creation, entity+relation creation, and list reads from the real API."
      aside={
        <div className="stack">
          <div className="info-card">
            <h3>Session</h3>
            <p>{token ? `Authorized as ${currentUser?.email ?? 'loading...'}` : 'Not authorized'}</p>
            <button type="button" className="button" disabled={!token} onClick={clearSession}>
              Clear session
            </button>
          </div>
          <div className="info-card">
            <h3>Selected context</h3>
            <dl className="metric-grid">
              <div>
                <dt>Workspace</dt>
                <dd>{selectedWorkspace?.slug ?? '-'}</dd>
              </div>
              <div>
                <dt>Space</dt>
                <dd>{selectedSpace?.slug ?? '-'}</dd>
              </div>
              <div>
                <dt>Entities</dt>
                <dd>{entities.length}</dd>
              </div>
              <div>
                <dt>Relations</dt>
                <dd>{relations.length}</dd>
              </div>
            </dl>
          </div>
          <div className="info-card">
            <h3>Logs</h3>
            <ul className="bullet-list core-log-list">
              {logLines.length === 0 ? <li>No actions yet</li> : null}
              {logLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      }
    >
      <div className="core-shell">
        <div className="core-grid">
          <section className="core-panel">
            <h3>Auth</h3>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <div className="core-actions">
              <button type="button" className="button" disabled={busy} onClick={authenticateRegister}>
                Register
              </button>
              <button type="button" className="button button--ghost" disabled={busy} onClick={authenticateLogin}>
                Login
              </button>
            </div>
          </section>

          <section className="core-panel">
            <h3>Workspace</h3>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                type="text"
                value={workspaceSlug}
                onChange={(event) => setWorkspaceSlug(event.target.value.toLowerCase())}
              />
            </label>
            <div className="core-actions">
              <button type="button" className="button" disabled={!token || busy} onClick={createWorkspace}>
                Create workspace
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || busy}
                onClick={() => token && run(() => loadWorkspaces(token))}
              >
                Refresh
              </button>
            </div>
            <label className="field">
              <span>Current workspace</span>
              <select
                className="core-select"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">Select workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.slug})
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="core-panel">
            <h3>Space</h3>
            <label className="field">
              <span>Name</span>
              <input type="text" value={spaceName} onChange={(event) => setSpaceName(event.target.value)} />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                type="text"
                value={spaceSlug}
                onChange={(event) => setSpaceSlug(event.target.value.toLowerCase())}
              />
            </label>
            <div className="core-actions">
              <button
                type="button"
                className="button"
                disabled={!token || !workspaceId || busy}
                onClick={createSpace}
              >
                Create space
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || !workspaceId || busy}
                onClick={() => token && workspaceId && run(() => loadSpaces(token, workspaceId))}
              >
                Refresh
              </button>
            </div>
            <label className="field">
              <span>Current space</span>
              <select
                className="core-select"
                value={spaceId}
                onChange={(event) => setSpaceId(event.target.value)}
              >
                <option value="">Select space</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} ({space.slug})
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="core-panel">
            <h3>Entity and relation</h3>
            <label className="field">
              <span>Entity title</span>
              <input
                type="text"
                value={entityTitle}
                onChange={(event) => setEntityTitle(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Entity summary</span>
              <input
                type="text"
                value={entitySummary}
                onChange={(event) => setEntitySummary(event.target.value)}
              />
            </label>
            <div className="core-actions">
              <button
                type="button"
                className="button"
                disabled={!token || !spaceId || busy}
                onClick={createEntity}
              >
                Create entity
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || !spaceId || busy}
                onClick={() => token && spaceId && run(() => loadEntities(token, spaceId))}
              >
                Refresh entities
              </button>
            </div>
            <label className="field">
              <span>Relation type</span>
              <input
                type="text"
                value={relationType}
                onChange={(event) => setRelationType(event.target.value)}
              />
            </label>
            <label className="field">
              <span>From entity</span>
              <select
                className="core-select"
                value={relationFromId}
                onChange={(event) => setRelationFromId(event.target.value)}
              >
                <option value="">Select source</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>To entity</span>
              <select
                className="core-select"
                value={relationToId}
                onChange={(event) => setRelationToId(event.target.value)}
              >
                <option value="">Select target</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="core-actions">
              <button
                type="button"
                className="button"
                disabled={!token || !spaceId || !relationFromId || !relationToId || busy}
                onClick={createRelation}
              >
                Create relation
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || !spaceId || busy}
                onClick={() => token && spaceId && run(() => loadRelations(token, spaceId))}
              >
                Refresh relations
              </button>
            </div>
          </section>
        </div>
      </div>
    </PrototypeChrome>
  );
}
