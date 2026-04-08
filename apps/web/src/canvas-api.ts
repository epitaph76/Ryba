import type {
  ApiEnvelope,
  AuthSession,
  CanvasStateInput,
  CanvasStateRecord,
  DocumentBacklinkRecord,
  DocumentDetailRecord,
  DocumentRecord,
  EntityRecord,
  EntityTypeRecord,
  GroupRecord,
  RelationRecord,
  SavedViewRecord,
  SpaceRecord,
  UserRecord,
  WorkspaceRecord,
} from '@ryba/types';

type ListResponse<TItem> = { items: TItem[] };

class ApiRequestError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(`${code}: ${message}`);
    this.name = 'ApiRequestError';
    this.code = code;
    this.details = details;
  }
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:3001';

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
    if (!json.ok) {
      throw new ApiRequestError(json.error.code, json.error.message, json.error.details);
    }

    throw new Error(`HTTP ${response.status}`);
  }

  return json.data;
}

export const canvasApi = {
  register(input: { email: string; password: string; displayName?: string }) {
    return request<AuthSession>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  login(input: { email: string; password: string }) {
    return request<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  me(token: string) {
    return request<UserRecord>('/auth/me', { method: 'GET' }, token);
  },

  listWorkspaces(token: string) {
    return request<ListResponse<WorkspaceRecord>>('/workspaces', { method: 'GET' }, token);
  },

  createWorkspace(
    token: string,
    input: {
      name: string;
      slug: string;
    },
  ) {
    return request<WorkspaceRecord>(
      '/workspaces',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  listSpaces(token: string, workspaceId: string) {
    return request<ListResponse<SpaceRecord>>(
      `/workspaces/${workspaceId}/spaces`,
      { method: 'GET' },
      token,
    );
  },

  createSpace(
    token: string,
    workspaceId: string,
    input: {
      name: string;
      slug: string;
    },
  ) {
    return request<SpaceRecord>(
      `/workspaces/${workspaceId}/spaces`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  listGroups(token: string, spaceId: string) {
    return request<ListResponse<GroupRecord>>(
      `/spaces/${spaceId}/groups`,
      { method: 'GET' },
      token,
    );
  },

  createGroup(
    token: string,
    spaceId: string,
    input: {
      name: string;
      slug: string;
      description?: string | null;
    },
  ) {
    return request<GroupRecord>(
      `/spaces/${spaceId}/groups`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
        }),
      },
      token,
    );
  },

  listEntities(token: string, spaceId: string) {
    return request<ListResponse<EntityRecord>>(
      `/spaces/${spaceId}/entities`,
      { method: 'GET' },
      token,
    );
  },

  createEntity(
    token: string,
    spaceId: string,
    input: {
      entityTypeId?: string | null;
      title: string;
      summary?: string | null;
      properties?: Record<string, unknown>;
    },
  ) {
    return request<EntityRecord>(
      `/spaces/${spaceId}/entities`,
      {
        method: 'POST',
        body: JSON.stringify({
          entityTypeId: input.entityTypeId ?? undefined,
          title: input.title,
          summary: input.summary ?? null,
          properties: input.properties ?? {},
        }),
      },
      token,
    );
  },

  listGroupEntities(token: string, groupId: string) {
    return request<ListResponse<EntityRecord>>(
      `/groups/${groupId}/entities`,
      { method: 'GET' },
      token,
    );
  },

  createGroupEntity(
    token: string,
    groupId: string,
    input: {
      entityTypeId?: string | null;
      title: string;
      summary?: string | null;
      properties?: Record<string, unknown>;
    },
  ) {
    return request<EntityRecord>(
      `/groups/${groupId}/entities`,
      {
        method: 'POST',
        body: JSON.stringify({
          entityTypeId: input.entityTypeId ?? undefined,
          title: input.title,
          summary: input.summary ?? null,
          properties: input.properties ?? {},
        }),
      },
      token,
    );
  },

  listRelations(token: string, spaceId: string) {
    return request<ListResponse<RelationRecord>>(
      `/spaces/${spaceId}/relations`,
      { method: 'GET' },
      token,
    );
  },

  createRelation(
    token: string,
    spaceId: string,
    input: {
      fromEntityId: string;
      toEntityId: string;
      relationType: string;
      properties?: Record<string, unknown>;
    },
  ) {
    return request<RelationRecord>(
      `/spaces/${spaceId}/relations`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          properties: input.properties ?? {},
        }),
      },
      token,
    );
  },

  listGroupRelations(token: string, groupId: string) {
    return request<ListResponse<RelationRecord>>(
      `/groups/${groupId}/relations`,
      { method: 'GET' },
      token,
    );
  },

  createGroupRelation(
    token: string,
    groupId: string,
    input: {
      fromEntityId: string;
      toEntityId: string;
      relationType: string;
      properties?: Record<string, unknown>;
    },
  ) {
    return request<RelationRecord>(
      `/groups/${groupId}/relations`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          properties: input.properties ?? {},
        }),
      },
      token,
    );
  },

  getCanvas(token: string, spaceId: string) {
    return request<CanvasStateRecord>(`/spaces/${spaceId}/canvas`, { method: 'GET' }, token);
  },

  getGroupCanvas(token: string, groupId: string) {
    return request<CanvasStateRecord>(`/groups/${groupId}/canvas`, { method: 'GET' }, token);
  },

  listSavedViews(token: string, spaceId: string) {
    return request<ListResponse<SavedViewRecord>>(
      `/spaces/${spaceId}/saved-views`,
      { method: 'GET' },
      token,
    );
  },

  listGroupSavedViews(token: string, groupId: string) {
    return request<ListResponse<SavedViewRecord>>(
      `/groups/${groupId}/saved-views`,
      { method: 'GET' },
      token,
    );
  },

  createSavedView(
    token: string,
    spaceId: string,
    input: {
      name: string;
      description?: string | null;
      entityTypeId?: string | null;
      viewType: SavedViewRecord['viewType'];
      config: SavedViewRecord['config'];
    },
  ) {
    return request<SavedViewRecord>(
      `/spaces/${spaceId}/saved-views`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          description: input.description ?? null,
          entityTypeId: input.entityTypeId ?? null,
          viewType: input.viewType,
          config: input.config,
        }),
      },
      token,
    );
  },

  createGroupSavedView(
    token: string,
    groupId: string,
    input: {
      name: string;
      description?: string | null;
      entityTypeId?: string | null;
      viewType: SavedViewRecord['viewType'];
      config: SavedViewRecord['config'];
    },
  ) {
    return request<SavedViewRecord>(
      `/groups/${groupId}/saved-views`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          description: input.description ?? null,
          entityTypeId: input.entityTypeId ?? null,
          viewType: input.viewType,
          config: input.config,
        }),
      },
      token,
    );
  },

  updateSavedView(
    token: string,
    savedViewId: string,
    input: {
      name?: string;
      description?: string | null;
      entityTypeId?: string | null;
      viewType?: SavedViewRecord['viewType'];
      config?: SavedViewRecord['config'];
    },
  ) {
    return request<SavedViewRecord>(
      `/saved-views/${savedViewId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  deleteSavedView(token: string, savedViewId: string) {
    return request<{ id: string }>(
      `/saved-views/${savedViewId}`,
      {
        method: 'DELETE',
      },
      token,
    );
  },

  listEntityTypes(token: string, workspaceId: string) {
    return request<ListResponse<EntityTypeRecord>>(
      `/workspaces/${workspaceId}/entity-types`,
      { method: 'GET' },
      token,
    );
  },

  createEntityType(
    token: string,
    workspaceId: string,
    input: {
      name: string;
      slug: string;
      description?: string | null;
      color?: string | null;
      icon?: string | null;
      fields: Array<{
        key: string;
        label: string;
        fieldType: EntityTypeRecord['fields'][number]['fieldType'];
        description?: string | null;
        required?: boolean;
        config?: Record<string, unknown>;
      }>;
    },
  ) {
    return request<EntityTypeRecord>(
      `/workspaces/${workspaceId}/entity-types`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  updateEntityType(
    token: string,
    entityTypeId: string,
    input: {
      name?: string;
      slug?: string;
      description?: string | null;
      color?: string | null;
      icon?: string | null;
      fields?: Array<{
        key: string;
        label: string;
        fieldType: EntityTypeRecord['fields'][number]['fieldType'];
        description?: string | null;
        required?: boolean;
        config?: Record<string, unknown>;
      }>;
    },
  ) {
    return request<EntityTypeRecord>(
      `/entity-types/${entityTypeId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  updateEntity(
    token: string,
    entityId: string,
    input: {
      entityTypeId?: string | null;
      title?: string;
      summary?: string | null;
      properties?: Record<string, unknown>;
    },
  ) {
    return request<EntityRecord>(
      `/entities/${entityId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  deleteEntity(token: string, entityId: string) {
    return request<{ id: string }>(
      `/entities/${entityId}`,
      {
        method: 'DELETE',
      },
      token,
    );
  },

  listDocuments(token: string, spaceId: string) {
    return request<ListResponse<DocumentRecord>>(
      `/spaces/${spaceId}/documents`,
      { method: 'GET' },
      token,
    );
  },

  listGroupDocuments(token: string, groupId: string) {
    return request<ListResponse<DocumentRecord>>(
      `/groups/${groupId}/documents`,
      { method: 'GET' },
      token,
    );
  },

  createDocument(
    token: string,
    spaceId: string,
    input: {
      title: string;
      body: DocumentRecord['body'];
    },
  ) {
    return request<DocumentDetailRecord>(
      `/spaces/${spaceId}/documents`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  createGroupDocument(
    token: string,
    groupId: string,
    input: {
      title: string;
      body: DocumentRecord['body'];
    },
  ) {
    return request<DocumentDetailRecord>(
      `/groups/${groupId}/documents`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  getDocument(token: string, documentId: string) {
    return request<DocumentDetailRecord>(`/documents/${documentId}`, { method: 'GET' }, token);
  },

  getEntityDocument(token: string, entityId: string) {
    return request<DocumentDetailRecord>(`/entities/${entityId}/document`, { method: 'GET' }, token);
  },

  updateDocument(
    token: string,
    documentId: string,
    input: {
      title?: string;
      body?: DocumentRecord['body'];
    },
  ) {
    return request<DocumentDetailRecord>(
      `/documents/${documentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  listDocumentBacklinks(token: string, entityId: string) {
    return request<ListResponse<DocumentBacklinkRecord>>(
      `/entities/${entityId}/document-backlinks`,
      { method: 'GET' },
      token,
    );
  },

  upsertEntityDocument(
    token: string,
    entityId: string,
    input: {
      title?: string;
      body: DocumentRecord['body'];
    },
  ) {
    return request<DocumentDetailRecord>(
      `/entities/${entityId}/document`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  saveCanvas(token: string, spaceId: string, input: CanvasStateInput) {
    return request<CanvasStateRecord>(
      `/spaces/${spaceId}/canvas`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
      token,
    );
  },

  saveGroupCanvas(token: string, groupId: string, input: CanvasStateInput) {
    return request<CanvasStateRecord>(
      `/groups/${groupId}/canvas`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
      token,
    );
  },
};
