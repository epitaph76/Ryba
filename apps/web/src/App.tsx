import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from 'reactflow';
import type {
  AuthSession,
  CanvasEdgeLayout,
  CanvasStateRecord,
  DocumentBacklinkRecord,
  DocumentDetailRecord,
  DocumentRecord,
  EntityRecord,
  EntityTypeFieldRecord,
  EntityTypeRecord,
  RelationRecord,
  SpaceRecord,
  UserRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { canvasApi } from './canvas-api';
import {
  buildCanvasGraph,
  serializeCanvasState,
  type CanvasEntityNode,
  type CanvasEntityNodeData,
  type CanvasRelationEdge,
} from './canvas-model';
import {
  buildDraftPropertiesForType,
  buildEntityDetailDraft,
  buildEntityTypeDraft,
  buildEntityUpdatePayload,
  createEmptyEntityTypeDraft,
  createEmptyFieldDraft,
  getEntityTypeById,
  serializeEntityTypeDraft,
  type EntityDetailDraft,
  type EntityTypeDraft,
} from './entity-detail-model';
import { DocumentComposer } from './document-composer';
import {
  buildDocumentDraft,
  createEmptyDocumentDraft,
  findMentionedEntities,
  serializeDocumentDraft,
  type DocumentDraft,
} from './document-model';
import { getFieldOptions, type FieldEditorValue } from './field-renderers';

const TOKEN_STORAGE_KEY = 'ryba_s3_access_token';

function EntityCardNode({ data, selected }: NodeProps<CanvasEntityNodeData>) {
  return (
    <article className={`canvas-node${selected ? ' is-selected' : ''}`}>
      <div className="canvas-node__header">
        <span className="canvas-node__badge">сущность</span>
        <span className="canvas-node__meta">{data.relationCount} связей</span>
      </div>
      <strong>{data.title}</strong>
      <span className="canvas-node__id">{data.entityId}</span>
      {data.entityTypeName ? <span className="canvas-node__type">{data.entityTypeName}</span> : null}
      <p>{data.summary ?? 'Описание пока пустое. Открой инспектор, чтобы дополнить запись.'}</p>
      <Handle type="target" position={Position.Left} className="canvas-node__handle" />
      <Handle type="source" position={Position.Right} className="canvas-node__handle" />
    </article>
  );
}

const nodeTypes = {
  entityCard: EntityCardNode,
};

const defaultViewport = {
  zoom: 1,
  offset: { x: 0, y: 0 },
};

const toCommaSeparated = (value: FieldEditorValue) => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'string') {
    return value;
  }

  return '';
};

const fromCommaSeparated = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function App() {
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<CanvasEntityNodeData, { relationId: string; relationType: string }> | null
  >(null);

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [spaces, setSpaces] = useState<SpaceRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityTypeRecord[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [nodes, setNodes] = useState<CanvasEntityNode[]>([]);
  const [edges, setEdges] = useState<CanvasRelationEdge[]>([]);
  const [edgeLayouts, setEdgeLayouts] = useState<CanvasEdgeLayout[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasStateRecord | null>(null);
  const [viewport, setViewport] = useState(defaultViewport);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [entitySaveBusy, setEntitySaveBusy] = useState(false);
  const [schemaSaveBusy, setSchemaSaveBusy] = useState(false);
  const [documentSaveBusy, setDocumentSaveBusy] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [entityDetailDraft, setEntityDetailDraft] = useState<EntityDetailDraft | null>(null);
  const [activeSchemaTypeId, setActiveSchemaTypeId] = useState('');
  const [entityTypeDraft, setEntityTypeDraft] = useState<EntityTypeDraft>(createEmptyEntityTypeDraft());
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<DocumentDetailRecord | null>(null);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(createEmptyDocumentDraft());
  const [documentBacklinks, setDocumentBacklinks] = useState<DocumentBacklinkRecord[]>([]);

  const [email, setEmail] = useState('demo@ryba.local');
  const [password, setPassword] = useState('Password123');
  const [displayName, setDisplayName] = useState('Демо Ryba');
  const [workspaceName, setWorkspaceName] = useState('Рабочее пространство канвы');
  const [workspaceSlug, setWorkspaceSlug] = useState('canvas-workspace');
  const [spaceName, setSpaceName] = useState('Общее');
  const [spaceSlug, setSpaceSlug] = useState('general');
  const [quickEntityTitle, setQuickEntityTitle] = useState('Новая сущность');
  const [quickEntitySummary, setQuickEntitySummary] = useState('Создано из канвы S3');
  const [relationType, setRelationType] = useState('связано с');

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? null;
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;
  const selectedEntityType = getEntityTypeById(entityTypes, entityDetailDraft?.entityTypeId);
  const activeSchemaType = getEntityTypeById(entityTypes, activeSchemaTypeId || null);
  const mentionedEntities = useMemo(() => {
    if (documentDetail) {
      return documentDetail.mentionedEntities;
    }

    return findMentionedEntities(documentDraft.body, entities).map((entity) => ({
      entityId: entity.id,
      label: entity.title,
      anchorId: null,
      title: entity.title,
      summary: entity.summary,
      entityTypeId: entity.entityTypeId,
    }));
  }, [documentDetail, documentDraft.body, entities]);

  const relatedToSelectedEntity = useMemo(() => {
    if (!selectedEntity) {
      return [];
    }

    return relations.filter(
      (relation) =>
        relation.fromEntityId === selectedEntity.id || relation.toEntityId === selectedEntity.id,
    );
  }, [relations, selectedEntity]);

  const appendLog = (message: string) => {
    setLogLines((previous) => {
      return [`${new Date().toLocaleTimeString()} ${message}`, ...previous].slice(0, 12);
    });
  };

  const syncSession = (session: AuthSession) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, session.accessToken);
    setToken(session.accessToken);
    setCurrentUser(session.user);
    appendLog(`Вход выполнен: ${session.user.email}`);
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setWorkspaces([]);
    setSpaces([]);
    setEntities([]);
    setEntityTypes([]);
    setRelations([]);
    setDocuments([]);
    setNodes([]);
    setEdges([]);
    setEdgeLayouts([]);
    setCanvasState(null);
    setSelectedWorkspaceId('');
    setSelectedSpaceId('');
    setSelectedEntityId(null);
    setSelectedDocumentId(null);
    setActiveSchemaTypeId('');
    setEntityTypeDraft(createEmptyEntityTypeDraft());
    setEntityDetailDraft(null);
    setDocumentDetail(null);
    setDocumentDraft(createEmptyDocumentDraft());
    setDocumentBacklinks([]);
    setCanvasError(null);
    setLayoutDirty(false);
    appendLog('Сессия очищена');
  };

  const withAction = async (label: string, task: () => Promise<void>) => {
    setBusyLabel(label);
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Непредвиденная ошибка';
      appendLog(message);
      setCanvasError(message);
    } finally {
      setBusyLabel(null);
    }
  };

  const applyCanvasSnapshot = (
    nextEntities: EntityRecord[],
    nextRelations: RelationRecord[],
    nextCanvas: CanvasStateRecord,
    focusEntityId: string | null,
    nextEntityTypes: EntityTypeRecord[] = entityTypes,
  ) => {
    const graph = buildCanvasGraph({
      entities: nextEntities,
      entityTypes: nextEntityTypes,
      relations: nextRelations,
      canvas: nextCanvas,
      selectedEntityId: focusEntityId,
    });

    setEntities(nextEntities);
    setRelations(nextRelations);
    setCanvasState(nextCanvas);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setEdgeLayouts(nextCanvas.edges);
    setViewport(nextCanvas.viewport);
    setSelectedEntityId(focusEntityId);
    setCanvasError(null);
    setLayoutDirty(false);
  };

  const loadWorkspaces = async (activeToken: string) => {
    const response = await canvasApi.listWorkspaces(activeToken);
    setWorkspaces(response.items);

    if (!selectedWorkspaceId && response.items[0]) {
      setSelectedWorkspaceId(response.items[0].id);
    }
  };

  const loadEntityTypes = async (activeToken: string, workspaceId: string) => {
    const response = await canvasApi.listEntityTypes(activeToken, workspaceId);
    setEntityTypes(response.items);
    setActiveSchemaTypeId((current) => {
      if (current && response.items.some((entityType) => entityType.id === current)) {
        return current;
      }

      return response.items[0]?.id ?? '';
    });
  };

  const loadSpaces = async (activeToken: string, workspaceId: string) => {
    const response = await canvasApi.listSpaces(activeToken, workspaceId);
    setSpaces(response.items);

    if (!response.items.some((space) => space.id === selectedSpaceId)) {
      setSelectedSpaceId(response.items[0]?.id ?? '');
    }
  };

  const loadDocuments = async (activeToken: string, spaceId: string) => {
    const response = await canvasApi.listDocuments(activeToken, spaceId);
    setDocuments(response.items);
    setSelectedDocumentId((current) => {
      if (current && response.items.some((document) => document.id === current)) {
        return current;
      }

      return response.items[0]?.id ?? null;
    });
  };

  const loadDocumentDetail = async (activeToken: string, documentId: string) => {
    setDocumentLoading(true);

    try {
      const detail = await canvasApi.getDocument(activeToken, documentId);
      setDocumentDetail(detail);
      setDocumentDraft(buildDocumentDraft(detail.document));
    } finally {
      setDocumentLoading(false);
    }
  };

  const loadCanvas = async (
    activeToken: string,
    spaceId: string,
    focusEntityId: string | null = selectedEntityId,
  ) => {
    setCanvasLoading(true);

    try {
      const [entitiesResponse, relationsResponse, canvasResponse] = await Promise.all([
        canvasApi.listEntities(activeToken, spaceId),
        canvasApi.listRelations(activeToken, spaceId),
        canvasApi.getCanvas(activeToken, spaceId),
      ]);

      applyCanvasSnapshot(
        entitiesResponse.items,
        relationsResponse.items,
        canvasResponse,
        focusEntityId,
      );
    } finally {
      setCanvasLoading(false);
    }
  };

  const persistLayout = async (reason: string) => {
    if (!token || !selectedSpaceId) {
      return;
    }

    const payload = serializeCanvasState({
      spaceId: selectedSpaceId,
      nodes,
      edgeLayouts,
      viewport,
    }).payload;

    const saved = await canvasApi.saveCanvas(token, selectedSpaceId, payload);
    setCanvasState(saved);
    setEdgeLayouts(saved.edges);
    setViewport(saved.viewport);
    setLayoutDirty(false);
    appendLog(`Макет сохранён: ${reason}`);
  };

  const getCanvasCenterPosition = () => {
    const bounds = flowWrapperRef.current?.getBoundingClientRect();

    if (!flowInstance || !bounds) {
      return {
        x: 120 + nodes.length * 24,
        y: 120 + nodes.length * 24,
      };
    }

    return flowInstance.project({
      x: bounds.width / 2,
      y: bounds.height / 2,
    });
  };

  const createEntityAtPosition = async (position: { x: number; y: number }, origin: string) => {
    if (!token || !selectedSpaceId) {
      return;
    }

    const title = quickEntityTitle.trim() || `Сущность ${entities.length + 1}`;
    const summary = quickEntitySummary.trim() || null;
    const created = await canvasApi.createEntity(token, selectedSpaceId, {
      title,
      summary,
    });

    const nextNodes = [
      ...nodes.map((node) => ({ ...node, selected: false })),
      {
        id: created.id,
        type: 'entityCard',
        position,
        data: {
          entityId: created.id,
          title: created.title,
          summary: created.summary,
          entityTypeName: null,
          relationCount: 0,
        },
        selected: true,
      } satisfies CanvasEntityNode,
    ];

    await canvasApi.saveCanvas(
      token,
      selectedSpaceId,
      serializeCanvasState({
        spaceId: selectedSpaceId,
        nodes: nextNodes,
        edgeLayouts,
        viewport,
      }).payload,
    );

    appendLog(`Сущность создана из ${origin}: ${created.title}`);
    await loadCanvas(token, selectedSpaceId, created.id);
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    void withAction('Загрузка сессии', async () => {
      const user = await canvasApi.me(token);
      setCurrentUser(user);
      await loadWorkspaces(token);
    });
  }, [token]);

  useEffect(() => {
    if (!token || !selectedWorkspaceId) {
      return;
    }

    void withAction('Загрузка пространств', async () => {
      await Promise.all([
        loadSpaces(token, selectedWorkspaceId),
        loadEntityTypes(token, selectedWorkspaceId),
      ]);
    });
  }, [selectedWorkspaceId, token]);

  useEffect(() => {
    if (!token || !selectedSpaceId) {
      setDocuments([]);
      setSelectedDocumentId(null);
      setDocumentDetail(null);
      setDocumentDraft(createEmptyDocumentDraft());
      return;
    }

    void Promise.all([loadCanvas(token, selectedSpaceId), loadDocuments(token, selectedSpaceId)]);
  }, [selectedSpaceId, token]);

  useEffect(() => {
    if (!token || !selectedDocumentId) {
      setDocumentDetail(null);
      setDocumentDraft(createEmptyDocumentDraft());
      return;
    }

    void loadDocumentDetail(token, selectedDocumentId);
  }, [selectedDocumentId, token]);

  useEffect(() => {
    if (!flowInstance || !canvasState) {
      return;
    }

    const nextViewport: Viewport = {
      x: canvasState.viewport.offset.x,
      y: canvasState.viewport.offset.y,
      zoom: canvasState.viewport.zoom,
    };

    void flowInstance.setViewport(nextViewport, { duration: 0 });
  }, [canvasState, flowInstance]);

  useEffect(() => {
    setEntityDetailDraft(buildEntityDetailDraft(selectedEntity, entityTypes));
  }, [entityTypes, selectedEntity]);

  useEffect(() => {
    if (!token || !selectedEntityId) {
      setDocumentBacklinks([]);
      return;
    }

    void canvasApi
      .listDocumentBacklinks(token, selectedEntityId)
      .then((response) => setDocumentBacklinks(response.items))
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить backlinks';
        appendLog(message);
        setDocumentBacklinks([]);
      });
  }, [selectedEntityId, token]);

  useEffect(() => {
    setEntityTypeDraft(buildEntityTypeDraft(activeSchemaType));
  }, [activeSchemaType]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const entity = entities.find((item) => item.id === node.id);
        const nextTypeName = entity?.entityTypeId
          ? entityTypes.find((item) => item.id === entity.entityTypeId)?.name ?? 'Typed record'
          : null;

        if (node.data.entityTypeName === nextTypeName) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            entityTypeName: nextTypeName,
          },
        };
      }),
    );
  }, [entities, entityTypes]);

  const authenticateRegister = () =>
    withAction('Регистрация', async () => {
      const session = await canvasApi.register({
        email,
        password,
        displayName,
      });
      syncSession(session);
    });

  const authenticateLogin = () =>
    withAction('Вход', async () => {
      const session = await canvasApi.login({
        email,
        password,
      });
      syncSession(session);
    });

  const createWorkspace = () =>
    withAction('Создание рабочего пространства', async () => {
      if (!token) {
        return;
      }

      const workspace = await canvasApi.createWorkspace(token, {
        name: workspaceName,
        slug: workspaceSlug,
      });
      appendLog(`Рабочее пространство создано: ${workspace.slug}`);
      await loadWorkspaces(token);
      setSelectedWorkspaceId(workspace.id);
    });

  const createSpace = () =>
    withAction('Создание пространства', async () => {
      if (!token || !selectedWorkspaceId) {
        return;
      }

      const space = await canvasApi.createSpace(token, selectedWorkspaceId, {
        name: spaceName,
        slug: spaceSlug,
      });
      appendLog(`Пространство создано: ${space.slug}`);
      await loadSpaces(token, selectedWorkspaceId);
      setSelectedSpaceId(space.id);
    });

  const quickCreateCenteredEntity = () =>
    withAction('Создание сущности', async () => {
      await createEntityAtPosition(getCanvasCenterPosition(), 'панели');
    });

  const handleCanvasDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!flowInstance || !flowWrapperRef.current || !token || !selectedSpaceId || busyLabel) {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (!target?.closest('.react-flow__pane, .react-flow__background')) {
      return;
    }

    void withAction('Создание сущности', async () => {
      const bounds = flowWrapperRef.current?.getBoundingClientRect();

      if (!bounds) {
        return;
      }

      const position = flowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      await createEntityAtPosition(position, 'канвы');
    });
  };

  const handleConnect = (connection: Connection) => {
    if (!token || !selectedSpaceId || !connection.source || !connection.target || busyLabel) {
      return;
    }

    const sourceId = connection.source;
    const targetId = connection.target;

    if (sourceId === targetId) {
      appendLog('Для связи нужны две разные сущности');
      return;
    }

    void withAction('Создание связи', async () => {
      await canvasApi.createRelation(token, selectedSpaceId, {
        fromEntityId: sourceId,
        toEntityId: targetId,
        relationType,
      });
      appendLog(`Связь создана: ${relationType}`);
      await loadCanvas(token, selectedSpaceId, targetId);
    });
  };

  const onNodesChange = (changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    if (changes.length > 0) {
      setLayoutDirty(true);
    }
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  };

  const updateDetailDraft = (patch: Partial<EntityDetailDraft>) => {
    setEntityDetailDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const setDetailFieldValue = (fieldKey: string, value: FieldEditorValue) => {
    setEntityDetailDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        properties: {
          ...current.properties,
          [fieldKey]: value,
        },
      };
    });
  };

  const handleDetailEntityTypeChange = (nextEntityTypeId: string) => {
    setEntityDetailDraft((current) => {
      if (!current) {
        return current;
      }

      const nextType = getEntityTypeById(entityTypes, nextEntityTypeId || null);
      const baseProperties = selectedEntity?.properties ?? {};

      return {
        ...current,
        entityTypeId: nextEntityTypeId || null,
        properties: buildDraftPropertiesForType(nextType, baseProperties),
      };
    });
  };

  const saveEntityDetail = () =>
    withAction('Сохранение записи', async () => {
      if (!token || !selectedSpaceId || !selectedEntity || !entityDetailDraft) {
        return;
      }

      setEntitySaveBusy(true);

      try {
        const payload = buildEntityUpdatePayload(entityDetailDraft, entityTypes);
        const updated = await canvasApi.updateEntity(token, selectedEntity.id, payload);
        appendLog(`Запись обновлена: ${updated.title}`);
        await loadCanvas(token, selectedSpaceId, updated.id);
      } finally {
        setEntitySaveBusy(false);
      }
    });

  const startNewDocument = () => {
    setSelectedDocumentId(null);
    setDocumentDetail(null);
    setDocumentDraft(createEmptyDocumentDraft());
  };

  const saveDocument = () =>
    withAction('Сохранение документа', async () => {
      if (!token || !selectedSpaceId) {
        return;
      }

      const payload = serializeDocumentDraft(documentDraft);

      if (!payload.title) {
        throw new Error('Document title is required');
      }

      setDocumentSaveBusy(true);

      try {
        const detail = selectedDocumentId
          ? await canvasApi.updateDocument(token, selectedDocumentId, payload)
          : await canvasApi.createDocument(token, selectedSpaceId, payload);

        setDocumentDetail(detail);
        setDocumentDraft(buildDocumentDraft(detail.document));
        setSelectedDocumentId(detail.document.id);
        appendLog(
          selectedDocumentId
            ? `Документ обновлён: ${detail.document.title}`
            : `Документ создан: ${detail.document.title}`,
        );
        await loadDocuments(token, selectedSpaceId);
      } finally {
        setDocumentSaveBusy(false);
      }
    });

  const startNewEntityType = () => {
    setActiveSchemaTypeId('');
    setEntityTypeDraft(createEmptyEntityTypeDraft());
  };

  const updateEntityTypeDraft = (patch: Partial<EntityTypeDraft>) => {
    setEntityTypeDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const updateSchemaField = (
    fieldIndex: number,
    patch: Partial<EntityTypeDraft['fields'][number]>,
  ) => {
    setEntityTypeDraft((current) => ({
      ...current,
      fields: current.fields.map((field, index) =>
        index === fieldIndex
          ? {
              ...field,
              ...patch,
            }
          : field,
      ),
    }));
  };

  const addSchemaField = () => {
    setEntityTypeDraft((current) => ({
      ...current,
      fields: [...current.fields, createEmptyFieldDraft()],
    }));
  };

  const removeSchemaField = (fieldIndex: number) => {
    setEntityTypeDraft((current) => ({
      ...current,
      fields: current.fields.filter((_, index) => index !== fieldIndex),
    }));
  };

  const saveSchemaLayer = () =>
    withAction('Сохранение схемы', async () => {
      if (!token || !selectedWorkspaceId) {
        return;
      }

      const payload = serializeEntityTypeDraft(entityTypeDraft);

      if (!payload.name || !payload.slug) {
        throw new Error('Type name and slug are required');
      }

      setSchemaSaveBusy(true);

      try {
        let persistedTypeId = activeSchemaTypeId;

        if (activeSchemaTypeId) {
          const updated = await canvasApi.updateEntityType(token, activeSchemaTypeId, payload);
          persistedTypeId = updated.id;
          appendLog(`Тип обновлён: ${updated.slug}`);
        } else {
          const created = await canvasApi.createEntityType(token, selectedWorkspaceId, payload);
          persistedTypeId = created.id;
          appendLog(`Тип создан: ${created.slug}`);
        }

        const nextTypes = await canvasApi.listEntityTypes(token, selectedWorkspaceId);
        setEntityTypes(nextTypes.items);
        setActiveSchemaTypeId(persistedTypeId);
      } finally {
        setSchemaSaveBusy(false);
      }
    });

  const renderFieldEditor = (field: EntityTypeFieldRecord) => {
    if (!entityDetailDraft) {
      return null;
    }

    const rawValue = entityDetailDraft.properties[field.key] ?? '';
    const options = getFieldOptions(field);
    const allowsMany = field.fieldType === 'multi_select' || field.config.allowMultiple === true;

    if (field.fieldType === 'boolean') {
      return (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={rawValue === true}
            onChange={(event) => setDetailFieldValue(field.key, event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
    }

    if (field.fieldType === 'select' || field.fieldType === 'status') {
      return (
        <label className="field">
          <span>{field.label}</span>
          <select
            value={typeof rawValue === 'string' ? rawValue : ''}
            onChange={(event) => setDetailFieldValue(field.key, event.target.value)}
          >
            <option value="">Not set</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.fieldType === 'multi_select' || ((field.fieldType === 'relation' || field.fieldType === 'user') && allowsMany)) {
      return (
        <label className="field">
          <span>{field.label}</span>
          <input
            type="text"
            value={toCommaSeparated(rawValue)}
            placeholder="comma, separated, values"
            onChange={(event) => setDetailFieldValue(field.key, fromCommaSeparated(event.target.value))}
          />
        </label>
      );
    }

    if (field.fieldType === 'rich_text') {
      return (
        <label className="field">
          <span>{field.label}</span>
          <textarea
            rows={4}
            value={typeof rawValue === 'string' ? rawValue : ''}
            onChange={(event) => setDetailFieldValue(field.key, event.target.value)}
          />
        </label>
      );
    }

    return (
      <label className="field">
        <span>{field.label}</span>
        <input
          type={
            field.fieldType === 'number'
              ? 'number'
              : field.fieldType === 'date'
                ? 'date'
                : field.fieldType === 'url'
                  ? 'url'
                  : 'text'
          }
          value={typeof rawValue === 'string' ? rawValue : ''}
          onChange={(event) => setDetailFieldValue(field.key, event.target.value)}
        />
      </label>
    );
  };

  return (
    <main className="s3-app">
      <header className="s3-hero">
        <div className="s3-hero__copy">
          <span className="eyebrow">Ryba S-5 documents and narrative layer</span>
          <h1>Канва, записи и narrative в одном рабочем слое</h1>
          <p>
            Теперь поверх сущностей и связей появился документный слой. Канва остаётся точкой
            навигации, detail view управляет structured data, а документы связывают это с rich
            text, mentions и backlinks.
          </p>
        </div>
        <div className="s3-hero__stats">
          <div>
            <span>Рабочее пространство</span>
            <strong>{selectedWorkspace?.slug ?? 'не выбрано'}</strong>
          </div>
          <div>
            <span>Пространство</span>
            <strong>{selectedSpace?.slug ?? 'не выбрано'}</strong>
          </div>
          <div>
            <span>Макет</span>
            <strong>{layoutDirty ? 'не сохранён' : canvasState?.updatedAt ? 'сохранён' : 'по умолчанию'}</strong>
          </div>
          <div>
            <span>Записи / документы</span>
            <strong>{entities.length} / {documents.length}</strong>
          </div>
        </div>
      </header>

      <section className="s3-layout">
        <aside className="s3-sidebar">
          <section className="panel">
            <div className="panel__header">
              <h2>Сессия</h2>
              <span>{currentUser?.email ?? 'гость'}</span>
            </div>
            <label className="field">
              <span>Почта</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Отображаемое имя</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <div className="actions">
              <button type="button" className="button" disabled={!!busyLabel} onClick={authenticateRegister}>
                Регистрация
              </button>
              <button type="button" className="button button--ghost" disabled={!!busyLabel} onClick={authenticateLogin}>
                Войти
              </button>
            </div>
            <button type="button" className="button button--ghost button--full" disabled={!token} onClick={clearSession}>
              Очистить сессию
            </button>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Schema layer</h2>
              <span>{activeSchemaType ? activeSchemaType.slug : 'new type'}</span>
            </div>
            <label className="field">
              <span>Active type</span>
              <select
                value={activeSchemaTypeId}
                onChange={(event) => setActiveSchemaTypeId(event.target.value)}
                disabled={!token || !selectedWorkspaceId || !!busyLabel || schemaSaveBusy}
              >
                <option value="">New entity type</option>
                {entityTypes.map((entityType) => (
                  <option key={entityType.id} value={entityType.id}>
                    {entityType.name} ({entityType.slug})
                  </option>
                ))}
              </select>
            </label>
            <div className="actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={startNewEntityType}
                disabled={!token || !selectedWorkspaceId || !!busyLabel || schemaSaveBusy}
              >
                New type
              </button>
              <button
                type="button"
                className="button"
                onClick={saveSchemaLayer}
                disabled={!token || !selectedWorkspaceId || !!busyLabel || schemaSaveBusy}
              >
                {schemaSaveBusy ? 'Saving...' : 'Save type'}
              </button>
            </div>
            <label className="field">
              <span>Type name</span>
              <input
                type="text"
                value={entityTypeDraft.name}
                onChange={(event) => updateEntityTypeDraft({ name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                type="text"
                value={entityTypeDraft.slug}
                onChange={(event) => updateEntityTypeDraft({ slug: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                rows={2}
                value={entityTypeDraft.description}
                onChange={(event) => updateEntityTypeDraft({ description: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Color token</span>
              <input
                type="text"
                value={entityTypeDraft.color}
                onChange={(event) => updateEntityTypeDraft({ color: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Icon</span>
              <input
                type="text"
                value={entityTypeDraft.icon}
                onChange={(event) => updateEntityTypeDraft({ icon: event.target.value })}
              />
            </label>
            <div className="schema-fields">
              {entityTypeDraft.fields.map((field, index) => (
                <div className="schema-field-row" key={`${field.key}-${index}`}>
                  <label className="field">
                    <span>Label</span>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(event) => updateSchemaField(index, { label: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Key</span>
                    <input
                      type="text"
                      value={field.key}
                      onChange={(event) => updateSchemaField(index, { key: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select
                      value={field.fieldType}
                      onChange={(event) =>
                        updateSchemaField(index, {
                          fieldType: event.target.value as EntityTypeFieldRecord['fieldType'],
                        })
                      }
                    >
                      <option value="text">text</option>
                      <option value="rich_text">rich_text</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="select">select</option>
                      <option value="multi_select">multi_select</option>
                      <option value="relation">relation</option>
                      <option value="user">user</option>
                      <option value="url">url</option>
                      <option value="status">status</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Options (comma separated)</span>
                    <input
                      type="text"
                      value={field.optionsText}
                      onChange={(event) =>
                        updateSchemaField(index, { optionsText: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <input
                      type="text"
                      value={field.description}
                      onChange={(event) =>
                        updateSchemaField(index, { description: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Relation type id</span>
                    <input
                      type="text"
                      value={field.relationEntityTypeId}
                      onChange={(event) =>
                        updateSchemaField(index, {
                          relationEntityTypeId: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) =>
                        updateSchemaField(index, { required: event.target.checked })
                      }
                    />
                    <span>Required</span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={field.allowMultiple}
                      onChange={(event) =>
                        updateSchemaField(index, { allowMultiple: event.target.checked })
                      }
                    />
                    <span>Allow multiple</span>
                  </label>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => removeSchemaField(index)}
                  >
                    Remove field
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button button--ghost button--full"
              onClick={addSchemaField}
              disabled={!token || !selectedWorkspaceId || !!busyLabel || schemaSaveBusy}
            >
              Add field
            </button>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Контекст</h2>
              <span>{busyLabel ?? 'готово'}</span>
            </div>
            <label className="field">
              <span>Название рабочего пространства</span>
              <input
                type="text"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Слаг рабочего пространства</span>
              <input
                type="text"
                value={workspaceSlug}
                onChange={(event) => setWorkspaceSlug(event.target.value.toLowerCase())}
              />
            </label>
            <div className="actions">
              <button type="button" className="button" disabled={!token || !!busyLabel} onClick={createWorkspace}>
                Создать рабочее пространство
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || !!busyLabel}
                onClick={() => token && void withAction('Обновление рабочих пространств', () => loadWorkspaces(token))}
              >
                Обновить
              </button>
            </div>
            <label className="field">
              <span>Текущее рабочее пространство</span>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              >
                <option value="">Выбери рабочее пространство</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Название пространства</span>
              <input type="text" value={spaceName} onChange={(event) => setSpaceName(event.target.value)} />
            </label>
            <label className="field">
              <span>Слаг пространства</span>
              <input
                type="text"
                value={spaceSlug}
                onChange={(event) => setSpaceSlug(event.target.value.toLowerCase())}
              />
            </label>
            <div className="actions">
              <button type="button" className="button" disabled={!token || !selectedWorkspaceId || !!busyLabel} onClick={createSpace}>
                Создать пространство
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || !selectedWorkspaceId || !!busyLabel}
                onClick={() =>
                  token &&
                  selectedWorkspaceId &&
                  void withAction('Обновление пространств', async () => {
                    await Promise.all([
                      loadSpaces(token, selectedWorkspaceId),
                      loadEntityTypes(token, selectedWorkspaceId),
                    ]);
                  })
                }
              >
                Обновить
              </button>
            </div>
            <label className="field">
              <span>Текущее пространство</span>
              <select value={selectedSpaceId} onChange={(event) => setSelectedSpaceId(event.target.value)}>
                <option value="">Выбери пространство</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} ({space.slug})
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Действия канвы</h2>
              <span>{canvasState?.updatedAt ? 'сохранено' : 'вид по умолчанию'}</span>
            </div>
            <label className="field">
              <span>Быстрый заголовок сущности</span>
              <input
                type="text"
                value={quickEntityTitle}
                onChange={(event) => setQuickEntityTitle(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Быстрое описание сущности</span>
              <textarea
                rows={3}
                value={quickEntitySummary}
                onChange={(event) => setQuickEntitySummary(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Тип связи для соединения</span>
              <input
                type="text"
                value={relationType}
                onChange={(event) => setRelationType(event.target.value)}
              />
            </label>
            <div className="actions">
              <button type="button" className="button" disabled={!token || !selectedSpaceId || !!busyLabel} onClick={quickCreateCenteredEntity}>
                Добавить в центр
              </button>
              <button type="button" className="button button--ghost" disabled={!token || !selectedSpaceId || !!busyLabel || !layoutDirty} onClick={() => void withAction('Сохранение макета', () => persistLayout('ручное сохранение'))}>
                Сохранить макет
              </button>
            </div>
            <p className="panel__hint">
              Дважды кликни по канве, чтобы поставить новую сущность. Соедини хендлы двух узлов,
              чтобы создать связь.
            </p>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Documents</h2>
              <span>{selectedDocument ? selectedDocument.title : `${documents.length} total`}</span>
            </div>
            <div className="document-panel">
              <div className="document-panel__actions">
                <button
                  type="button"
                  className="button"
                  disabled={!token || !selectedSpaceId || !!busyLabel}
                  onClick={startNewDocument}
                >
                  Новый документ
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={!token || !selectedSpaceId || !!busyLabel}
                  onClick={() =>
                    token && selectedSpaceId && void withAction('Обновление документов', () => loadDocuments(token, selectedSpaceId))
                  }
                >
                  Обновить
                </button>
              </div>

              <div className="document-list">
                {documents.length === 0 ? (
                  <p className="panel__hint">
                    Пока нет документов. Создай первый narrative-слой для текущего пространства.
                  </p>
                ) : (
                  documents.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      className={`document-list__item${document.id === selectedDocumentId ? ' is-active' : ''}`}
                      onClick={() => setSelectedDocumentId(document.id)}
                    >
                      <strong>{document.title}</strong>
                      <span>{document.previewText || 'Пустой документ'}</span>
                    </button>
                  ))
                )}
              </div>

              <DocumentComposer
                title={documentDraft.title}
                body={documentDraft.body}
                entities={entities}
                disabled={!token || !selectedSpaceId || !!busyLabel}
                onTitleChange={(value) =>
                  setDocumentDraft((current) => ({
                    ...current,
                    title: value,
                  }))
                }
                onBodyChange={(value) =>
                  setDocumentDraft((current) => ({
                    ...current,
                    body: value,
                  }))
                }
              />

              <button
                type="button"
                className="button button--full"
                disabled={!token || !selectedSpaceId || !!busyLabel || documentSaveBusy}
                onClick={saveDocument}
              >
                {documentSaveBusy ? 'Saving...' : selectedDocumentId ? 'Save document' : 'Create document'}
              </button>

              <div className="document-preview-list">
                <div className="panel__header">
                  <h2>Linked entities</h2>
                  <span>{mentionedEntities.length}</span>
                </div>
                {documentLoading ? (
                  <p className="panel__hint">Загружаю документ и его связи...</p>
                ) : mentionedEntities.length === 0 ? (
                  <p className="panel__hint">
                    Вставь mention из тулбара, чтобы документ начал ссылаться на сущности.
                  </p>
                ) : (
                  mentionedEntities.map((item) => (
                    <button
                      key={item.entityId}
                      type="button"
                      className="entity-preview-card"
                      onClick={() => setSelectedEntityId(item.entityId)}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.summary ?? item.label ?? 'Без описания'}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Detail view</h2>
              <span>{selectedEntity ? selectedEntity.title : 'nothing selected'}</span>
            </div>
            {selectedEntity && entityDetailDraft ? (
              <div className="detail-form">
                <div className="detail-form__meta">
                  <strong>{selectedEntity.id}</strong>
                  <span>{relatedToSelectedEntity.length} relations</span>
                </div>
                <label className="field">
                  <span>Entity type</span>
                  <select
                    value={entityDetailDraft.entityTypeId ?? ''}
                    onChange={(event) => handleDetailEntityTypeChange(event.target.value)}
                  >
                    <option value="">Untyped</option>
                    {entityTypes.map((entityType) => (
                      <option key={entityType.id} value={entityType.id}>
                        {entityType.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={entityDetailDraft.title}
                    onChange={(event) => updateDetailDraft({ title: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Summary</span>
                  <textarea
                    rows={3}
                    value={entityDetailDraft.summary}
                    onChange={(event) => updateDetailDraft({ summary: event.target.value })}
                  />
                </label>
                <div className="detail-fields">
                  {selectedEntityType?.fields.length ? (
                    selectedEntityType.fields
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((field) => (
                        <div className="detail-field-row" key={field.id}>
                          {renderFieldEditor(field)}
                        </div>
                      ))
                  ) : (
                    <p className="panel__hint">
                      This record has no typed fields yet. Select a type or add fields in schema layer.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="button button--full"
                  onClick={saveEntityDetail}
                  disabled={!token || !selectedSpaceId || !!busyLabel || entitySaveBusy}
                >
                  {entitySaveBusy ? 'Saving...' : 'Save record'}
                </button>
                <div className="document-preview-list">
                  <div className="panel__header">
                    <h2>Backlinks</h2>
                    <span>{documentBacklinks.length}</span>
                  </div>
                  {documentBacklinks.length === 0 ? (
                    <p className="panel__hint">
                      На текущую сущность пока никто не ссылается из документов.
                    </p>
                  ) : (
                    documentBacklinks.map((backlink) => (
                      <button
                        key={`${backlink.documentId}-${backlink.anchorId ?? 'root'}`}
                        type="button"
                        className="entity-preview-card"
                        onClick={() => setSelectedDocumentId(backlink.documentId)}
                      >
                        <strong>{backlink.documentTitle}</strong>
                        <span>{backlink.previewText}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="panel__hint">
                Select any canvas node to open and edit entity detail.
              </p>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Активность</h2>
              <span>{logLines.length}</span>
            </div>
            <ul className="compact-list">
              {logLines.length === 0 ? <li>Действий пока не было.</li> : null}
              {logLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="canvas-stage">
          <div className="canvas-toolbar">
            <div>
              <strong>{selectedSpace?.name ?? 'Выбери пространство'}</strong>
              <span>
                {canvasLoading
                  ? 'Загрузка канвы...'
                  : selectedSpace
                    ? 'Перетаскивай карточки, соединяй хендлы и сохраняй макет, когда он тебя устроит.'
                    : 'Создай пространство или выбери существующее, чтобы открыть канву S3.'}
              </span>
            </div>
            <div className="canvas-toolbar__actions">
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || !selectedSpaceId || !!busyLabel}
                onClick={() => token && selectedSpaceId && void withAction('Обновление канвы', () => loadCanvas(token, selectedSpaceId))}
              >
                Обновить канву
              </button>
              <span className={`status-pill${layoutDirty ? ' is-warning' : ''}`}>
                {layoutDirty ? 'Макет не сохранён' : canvasState?.updatedAt ? 'Макет сохранён' : 'Макет по умолчанию'}
              </span>
            </div>
          </div>

          <div className="canvas-shell" ref={flowWrapperRef} onDoubleClick={handleCanvasDoubleClick}>
            {!token ? (
              <div className="canvas-empty">
                <strong>Сначала авторизуйся</strong>
                <p>Используй панель сессии, чтобы зарегистрироваться или войти перед открытием канвы.</p>
              </div>
            ) : !selectedSpace ? (
              <div className="canvas-empty">
                <strong>Выбери пространство</strong>
                <p>Создай его в боковой панели или выбери существующее, чтобы загрузить реальные данные.</p>
              </div>
            ) : canvasLoading ? (
              <div className="canvas-empty">
                <strong>Загрузка канвы</strong>
                <p>Читаю сущности, связи и сохранённый макет из API.</p>
              </div>
            ) : canvasError ? (
              <div className="canvas-empty">
                <strong>Ошибка канвы</strong>
                <p>{canvasError}</p>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onInit={setFlowInstance}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                onMoveEnd={(_, nextViewport) => {
                  setViewport({
                    zoom: nextViewport.zoom,
                    offset: {
                      x: nextViewport.x,
                      y: nextViewport.y,
                    },
                  });
                  setLayoutDirty(true);
                }}
                onNodeClick={(_, node) => {
                  setSelectedEntityId(node.id);
                  setNodes((current) =>
                    current.map((item) => ({
                      ...item,
                      selected: item.id === node.id,
                    })),
                  );
                }}
                onNodeDragStop={() => {
                  setLayoutDirty(true);
                }}
                defaultEdgeOptions={{ style: { strokeWidth: 2.2, stroke: '#60a5fa' } }}
                proOptions={{ hideAttribution: true }}
              >
                <MiniMap
                  nodeStrokeColor="#60a5fa"
                  nodeColor="#10203a"
                  maskColor="rgba(7, 12, 24, 0.72)"
                />
                <Controls />
                <Background gap={24} size={1} color="rgba(125, 211, 252, 0.18)" />
              </ReactFlow>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
