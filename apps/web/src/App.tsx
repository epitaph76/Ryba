import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from 'reactflow';
import type {
  ActivityEventRecord,
  AuthSession,
  CanvasEdgeLayout,
  CanvasStateRecord,
  DocumentBacklinkRecord,
  DocumentDetailRecord,
  DocumentLinkDefinition,
  DocumentRecord,
  EntityRecord,
  EntityTypeFieldRecord,
  EntityTypeRecord,
  GroupRecord,
  RelationRecord,
  SavedViewRecord,
  SpaceRecord,
  UserRecord,
  WorkspaceMemberDetailRecord,
  WorkspaceRecord,
  WorkspaceRole,
} from '@ryba/types';

import { canvasApi } from './canvas-api';
import {
  restoreDeletedEntity,
  stageEntityDeletion,
  type CanvasDeletionState,
  type CanvasDeletionStateInput,
  type PendingEntityDeletion,
} from './canvas-delete-undo';
import { buildCrossSubspaceDocumentLinkDefinitions } from './document-link-runtime';
import {
  buildCanvasGraph,
  serializeCanvasState,
  isCanvasEntityNode,
  type CanvasGroupNodeData,
  type CanvasNode,
  type CanvasNodeData,
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
import { EntityDocumentDialog } from './entity-document-dialog';
import {
  findMentionedEntities,
} from './document-model';
import {
  buildEntityDocumentDraft,
  buildEntityDocumentPayload,
  getEntityDocumentOwnerEntityId,
  isEntityOwnedDocument,
} from './entity-document-model';
import { getFieldOptions, type FieldEditorValue } from './field-renderers';
import { isRecordInSubspaceContext, resolveActiveSubspace } from './subspace-model';
import { getWorkspaceCapabilities } from './workspace-permissions';
import { TableView } from './components/TableView';
import {
  buildDraftFromSavedView,
  createDefaultTableDraft,
  serializeStructuredViewDraft,
  syncStructuredViewDraft,
  type StructuredViewDraft,
} from './table-model';

const TOKEN_STORAGE_KEY = 'ryba_s3_access_token';
const LAST_EMAIL_STORAGE_KEY = 'ryba_last_email';
const ENTITY_DELETE_UNDO_WINDOW_MS = 8000;
const DEFAULT_COLLABORATION_URL = 'ws://localhost:1234';
function EntityCardNode({ data, selected }: NodeProps<CanvasEntityNodeData>) {
  return (
    <article className={`canvas-node${selected ? ' is-selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="canvas-node__handle"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="canvas-node__handle"
        isConnectable={false}
      />
      <div className="canvas-node__header">
        <span className="canvas-node__badge">сущность</span>
        <span className="canvas-node__meta">{data.relationCount} связей</span>
      </div>
      <strong>{data.title}</strong>
      <span className="canvas-node__id">{data.entityId}</span>
      {data.entityTypeName ? <span className="canvas-node__type">{data.entityTypeName}</span> : null}
      <p>{data.summary ?? 'Описание пока пустое. Открой инспектор, чтобы дополнить запись.'}</p>
    </article>
  );
}

function GroupCardNode({ data, selected }: NodeProps<CanvasGroupNodeData>) {
  return (
    <article
      className={`canvas-node canvas-node--group nopan${selected ? ' is-selected' : ''}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        data.onOpenGroup?.(data.groupId);
      }}
    >
      <div className="canvas-node__header">
        <span className="canvas-node__badge">subspace</span>
        <span className="canvas-node__meta">double click</span>
      </div>
      <strong>{data.name}</strong>
      <span className="canvas-node__id">{data.slug}</span>
      <p>
        {data.description ??
          'Локальный контекст внутри пространства. Открой его двойным нажатием по ноде.'}
      </p>
    </article>
  );
}

const nodeTypes = {
  entityCard: EntityCardNode,
  groupCard: GroupCardNode,
};

const defaultViewport = {
  zoom: 1,
  offset: { x: 0, y: 0 },
};

const activityDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
});

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

const formatActivityTimestamp = (value: string) => {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return activityDateFormatter.format(timestamp);
};

export function App() {
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const pendingEntityDeletionTimerRef = useRef<number | null>(null);
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<CanvasNodeData, { relationId: string; relationType: string }> | null
  >(null);

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberDetailRecord[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityEventRecord[]>([]);
  const [spaces, setSpaces] = useState<SpaceRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityTypeRecord[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasRelationEdge[]>([]);
  const [edgeLayouts, setEdgeLayouts] = useState<CanvasEdgeLayout[]>([]);
  const [groupNodePositionsBySpaceId, setGroupNodePositionsBySpaceId] = useState<
    Record<string, Record<string, { x: number; y: number }>>
  >({});
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasStateRecord | null>(null);
  const [viewport, setViewport] = useState(defaultViewport);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<{
    tone: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [entitySaveBusy, setEntitySaveBusy] = useState(false);
  const [schemaSaveBusy, setSchemaSaveBusy] = useState(false);
  const [documentSaveBusy, setDocumentSaveBusy] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [entityDetailDraft, setEntityDetailDraft] = useState<EntityDetailDraft | null>(null);
  const [activeSchemaTypeId, setActiveSchemaTypeId] = useState('');
  const [entityTypeDraft, setEntityTypeDraft] = useState<EntityTypeDraft>(createEmptyEntityTypeDraft());
  const [documentDetail, setDocumentDetail] = useState<DocumentDetailRecord | null>(null);
  const [documentBacklinks, setDocumentBacklinks] = useState<DocumentBacklinkRecord[]>([]);
  const [documentEditorEntityId, setDocumentEditorEntityId] = useState<string | null>(null);
  const [documentEditorDocumentId, setDocumentEditorDocumentId] = useState<string | null>(null);
  const [documentEditorTitle, setDocumentEditorTitle] = useState('');
  const [documentEditorBody, setDocumentEditorBody] = useState<DocumentDetailRecord['document']['body']>([]);
  const [spaceDocuments, setSpaceDocuments] = useState<DocumentRecord[]>([]);
  const [documentDefinitionDocuments, setDocumentDefinitionDocuments] = useState<DocumentRecord[]>([]);
  const [savedViews, setSavedViews] = useState<SavedViewRecord[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [tableLensDraft, setTableLensDraft] = useState<StructuredViewDraft>(() =>
    createDefaultTableDraft([]),
  );
  const [pendingEntityDeletion, setPendingEntityDeletion] = useState<PendingEntityDeletion | null>(
    null,
  );

  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_STORAGE_KEY) ?? 'demo@ryba.local');
  const [password, setPassword] = useState('Password123');
  const [displayName, setDisplayName] = useState('Демо Ryba');
  const [workspaceName, setWorkspaceName] = useState('Рабочее пространство канвы');
  const [workspaceSlug, setWorkspaceSlug] = useState('canvas-workspace');
  const [inviteMemberEmail, setInviteMemberEmail] = useState('');
  const [inviteMemberRole, setInviteMemberRole] = useState<'editor' | 'viewer'>('editor');
  const [spaceName, setSpaceName] = useState('Общее');
  const [spaceSlug, setSpaceSlug] = useState('general');
  const [groupName, setGroupName] = useState('Enterprise Clients');
  const [groupSlug, setGroupSlug] = useState('enterprise-clients');
  const [groupDescription, setGroupDescription] = useState(
    'Локальный контекст для отдельной темы или направления',
  );
  const [quickEntityTitle, setQuickEntityTitle] = useState('Новая сущность');
  const [quickEntitySummary, setQuickEntitySummary] = useState('Создано из канвы S3');
  const tokenRef = useRef<string | null>(token);
  const selectedSpaceIdRef = useRef(selectedSpaceId);
  const selectedGroupIdRef = useRef<string | null>(selectedGroupId);
  const liveCanvasStateRef = useRef<CanvasDeletionStateInput>({
    spaceId: '',
    groupId: null,
    entityTypes: [],
    entities: [],
    relations: [],
    nodes: [],
    edgeLayouts: [],
    viewport: defaultViewport,
    canvasUpdatedAt: null,
    documents: [],
    selectedEntityId: null,
  });

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const memberByUserId = useMemo(
    () => new Map(workspaceMembers.map((member) => [member.userId, member])),
    [workspaceMembers],
  );
  const currentWorkspaceMember =
    currentUser ? workspaceMembers.find((member) => member.userId === currentUser.id) ?? null : null;
  const currentWorkspaceRole = currentWorkspaceMember?.role ?? null;
  const documentCollaborationConfig = useMemo(
    () =>
      token && currentUser
        ? {
            token,
            websocketUrl: import.meta.env.VITE_COLLAB_URL ?? DEFAULT_COLLABORATION_URL,
            currentUser,
          }
        : null,
    [currentUser, token],
  );
  const workspaceCapabilities = getWorkspaceCapabilities(currentWorkspaceRole);
  const canReadSelectedWorkspace = workspaceCapabilities.canRead;
  const canEditSelectedWorkspace = workspaceCapabilities.canEdit;
  const canManageSelectedWorkspace = workspaceCapabilities.canManage;
  const workspaceAccessSummary = canManageSelectedWorkspace
    ? 'Owner управляет участниками, структурой workspace и всем контентом.'
    : canEditSelectedWorkspace
      ? 'Editor может менять контент, документы, канву и saved views, но не управляет составом команды.'
      : canReadSelectedWorkspace
        ? 'Viewer работает только в режиме чтения и не меняет контент или структуру.'
        : 'Доступ к workspace ещё не определён.';
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? null;
  const activeSubspace = resolveActiveSubspace({
    spaceId: selectedSpaceId,
    selectedGroupId,
    groups,
  });
  const selectedGroup = activeSubspace.group;
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const groupSlugById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.slug])),
    [groups],
  );
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const entityNodes = useMemo(() => nodes.filter(isCanvasEntityNode), [nodes]);
  const groupNodePositions = selectedSpaceId ? groupNodePositionsBySpaceId[selectedSpaceId] ?? {} : {};
  const activePendingDeletion =
    pendingEntityDeletion &&
    isRecordInSubspaceContext(pendingEntityDeletion.entity, {
      spaceId: selectedSpaceId,
      groupId: activeSubspace.groupId,
    })
      ? pendingEntityDeletion
      : null;
  const documentEditorEntity =
    entities.find((entity) => entity.id === documentEditorEntityId) ?? null;
  const selectedEntityType = getEntityTypeById(entityTypes, entityDetailDraft?.entityTypeId);
  const activeSchemaType = getEntityTypeById(entityTypes, activeSchemaTypeId || null);
  const selectedEntityCreatedBy =
    selectedEntity ? memberByUserId.get(selectedEntity.createdByUserId)?.user ?? null : null;
  const selectedEntityUpdatedBy =
    selectedEntity ? memberByUserId.get(selectedEntity.updatedByUserId)?.user ?? null : null;
  const linkDefinitions = useMemo<DocumentLinkDefinition[]>(
    () =>
      buildCrossSubspaceDocumentLinkDefinitions(
        documentDefinitionDocuments.length > 0 ? documentDefinitionDocuments : spaceDocuments,
        {
          currentGroupId: activeSubspace.groupId,
          groupSlugById,
        },
      ),
    [activeSubspace.groupId, documentDefinitionDocuments, groupSlugById, spaceDocuments],
  );
  const linkedDocumentEntities = useMemo(() => {
    if (!documentEditorEntity) {
      return [];
    }

    if (documentDetail) {
      return documentDetail.mentionedEntities.filter((item) => item.entityId !== documentEditorEntity.id);
    }

    return findMentionedEntities(documentEditorBody, entities)
      .filter((entity) => entity.id !== documentEditorEntity.id)
      .map((entity) => ({
        entityId: entity.id,
        label: entity.title,
        anchorId: null,
        title: entity.title,
        summary: entity.summary,
        entityTypeId: entity.entityTypeId,
        groupId: entity.groupId ?? null,
        groupSlug: entity.groupId ? groupSlugById.get(entity.groupId) ?? null : null,
      }));
  }, [documentDetail, documentEditorBody, documentEditorEntity, entities, groupSlugById]);
  const documentEditorDraft = useMemo(
    () => ({
      title: documentEditorTitle,
      body: documentEditorBody,
    }),
    [documentEditorBody, documentEditorTitle],
  );
  const persistedDocumentEditorDraft = useMemo(
    () =>
      documentEditorEntity
        ? buildEntityDocumentDraft(documentEditorEntity, documentDetail)
        : {
            title: '',
            body: [],
          },
    [documentDetail, documentEditorEntity],
  );
  const documentEditorDirty = useMemo(() => {
    if (!documentEditorEntity) {
      return false;
    }

    return JSON.stringify(documentEditorDraft) !== JSON.stringify(persistedDocumentEditorDraft);
  }, [documentEditorDraft, documentEditorEntity, persistedDocumentEditorDraft]);

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

  const clearPendingEntityDeletionTimer = () => {
    if (pendingEntityDeletionTimerRef.current === null) {
      return;
    }

    window.clearTimeout(pendingEntityDeletionTimerRef.current);
    pendingEntityDeletionTimerRef.current = null;
  };

  const applyLocalCanvasState = (nextState: CanvasDeletionState) => {
    const graph = buildCanvasGraph({
      entities: nextState.entities,
      entityTypes,
      groups,
      groupNodePositions,
      onOpenGroup: setSelectedGroupId,
      relations: nextState.relations,
      canvas: nextState.canvasState,
      selectedEntityId: nextState.selectedEntityId,
    });

    setEntities(nextState.entities);
    setRelations(nextState.relations);
    setCanvasState(nextState.canvasState);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setEdgeLayouts(nextState.edgeLayouts);
    setViewport(nextState.canvasState.viewport);
    setSpaceDocuments(nextState.documents);
    setSelectedEntityId(nextState.selectedEntityId);
    setDocumentBacklinks([]);
    setCanvasError(null);
  };

  const selectEntityOnCanvas = (entityId: string | null) => {
    setSelectedEntityId(entityId);
    setNodes((current) =>
      current.map((item) => ({
        ...item,
        selected: item.id === entityId,
      })),
    );
  };

  const syncSession = (session: AuthSession) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, session.accessToken);
    localStorage.setItem(LAST_EMAIL_STORAGE_KEY, session.user.email);
    setToken(session.accessToken);
    setCurrentUser(session.user);
    setEmail(session.user.email);
    setSessionFeedback({
      tone: 'success',
      message: `Вход выполнен: ${session.user.email}`,
    });
    appendLog(`Вход выполнен: ${session.user.email}`);
  };

  const clearSession = () => {
    clearPendingEntityDeletionTimer();
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setWorkspaces([]);
    setWorkspaceMembers([]);
    setActivityItems([]);
    setSpaces([]);
    setGroups([]);
    setEntities([]);
    setEntityTypes([]);
    setRelations([]);
    setNodes([]);
    setEdges([]);
    setEdgeLayouts([]);
    setCanvasState(null);
    setSelectedWorkspaceId('');
    setSelectedSpaceId('');
    setSelectedGroupId(null);
    setSelectedEntityId(null);
    setActiveSchemaTypeId('');
    setEntityTypeDraft(createEmptyEntityTypeDraft());
    setEntityDetailDraft(null);
    setDocumentDetail(null);
    setDocumentBacklinks([]);
    setDocumentEditorEntityId(null);
    setDocumentEditorDocumentId(null);
    setDocumentEditorTitle('');
    setDocumentEditorBody([]);
    setSpaceDocuments([]);
    setDocumentDefinitionDocuments([]);
    setSavedViews([]);
    setActiveSavedViewId(null);
    setTableLensDraft(createDefaultTableDraft([]));
    setPendingEntityDeletion(null);
    setCanvasError(null);
    setSessionFeedback({
      tone: 'info',
      message: 'Сессия очищена. Можно войти снова.',
    });
    setLayoutDirty(false);
    appendLog('Сессия очищена');
  };

  const withAction = async (label: string, task: () => Promise<unknown>) => {
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
      groups,
      groupNodePositions,
      onOpenGroup: setSelectedGroupId,
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
    selectEntityOnCanvas(focusEntityId);
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
    setTableLensDraft((current) => syncStructuredViewDraft(current, response.items));
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

  const loadWorkspaceMembers = async (activeToken: string, workspaceId: string) => {
    const response = await canvasApi.listWorkspaceMembers(activeToken, workspaceId);
    setWorkspaceMembers(response.items);
    return response.items;
  };

  const loadWorkspaceActivity = async (activeToken: string, workspaceId: string) => {
    const response = await canvasApi.listWorkspaceActivity(activeToken, workspaceId);
    setActivityItems(response.items);
    return response.items;
  };

  const refreshWorkspaceMembers = async () => {
    if (!token || !selectedWorkspaceId) {
      return;
    }

    await loadWorkspaceMembers(token, selectedWorkspaceId);
  };

  const refreshWorkspaceActivity = async () => {
    if (!token || !selectedWorkspaceId) {
      return;
    }

    await loadWorkspaceActivity(token, selectedWorkspaceId);
  };

  const loadGroups = async (activeToken: string, spaceId: string) => {
    const response = await canvasApi.listGroups(activeToken, spaceId);
    setGroups(response.items);
    setSelectedGroupId((current) =>
      current && response.items.some((group) => group.id === current) ? current : null,
    );
    return response.items;
  };

  const loadDocuments = async (
    activeToken: string,
    spaceId: string,
    groupId: string | null = activeSubspace.groupId,
  ) => {
    const response = groupId
      ? await canvasApi.listGroupDocuments(activeToken, groupId)
      : await canvasApi.listDocuments(activeToken, spaceId);
    setSpaceDocuments(response.items);
    return response.items;
  };

  const loadDocumentDefinitionDocuments = async (
    activeToken: string,
    spaceId: string,
    groupList: GroupRecord[] = groups,
  ) => {
    const responses = await Promise.all([
      canvasApi.listDocuments(activeToken, spaceId),
      ...groupList.map((group) => canvasApi.listGroupDocuments(activeToken, group.id)),
    ]);
    const documentById = new Map<string, DocumentRecord>();

    for (const response of responses) {
      for (const document of response.items) {
        documentById.set(document.id, document);
      }
    }

    const items = Array.from(documentById.values());
    setDocumentDefinitionDocuments(items);
    return items;
  };

  const loadSavedViews = async (
    activeToken: string,
    spaceId: string,
    groupId: string | null = activeSubspace.groupId,
  ) => {
    const response = groupId
      ? await canvasApi.listGroupSavedViews(activeToken, groupId)
      : await canvasApi.listSavedViews(activeToken, spaceId);
    setSavedViews(response.items);
    setActiveSavedViewId((current) =>
      current && response.items.some((savedView) => savedView.id === current) ? current : null,
    );
    return response.items;
  };

  const loadCanvas = async (
    activeToken: string,
    spaceId: string,
    focusEntityId: string | null = selectedEntityId,
    groupId: string | null = activeSubspace.groupId,
  ) => {
    setCanvasLoading(true);

    try {
      const [entitiesResponse, relationsResponse, canvasResponse, , documentsResponse] =
        await Promise.all([
        groupId
          ? canvasApi.listGroupEntities(activeToken, groupId)
          : canvasApi.listEntities(activeToken, spaceId),
        groupId
          ? canvasApi.listGroupRelations(activeToken, groupId)
          : canvasApi.listRelations(activeToken, spaceId),
        groupId
          ? canvasApi.getGroupCanvas(activeToken, groupId)
          : canvasApi.getCanvas(activeToken, spaceId),
        loadSavedViews(activeToken, spaceId, groupId),
        loadDocuments(activeToken, spaceId, groupId),
      ]);

      applyCanvasSnapshot(
        entitiesResponse.items,
        relationsResponse.items,
        canvasResponse,
        focusEntityId,
      );

      return {
        entities: entitiesResponse.items,
        relations: relationsResponse.items,
        documents: documentsResponse,
      };
    } finally {
      setCanvasLoading(false);
    }
  };

  const createDefaultCanvasNodeLayout = (entityId: string, index: number) => {
    const columns = 4;
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      entityId,
      position: {
        x: 96 + column * 280,
        y: 96 + row * 180,
      },
      size: null,
      zIndex: index + 1,
      collapsed: false,
    };
  };

  const applyCanvasDataPreservingLayout = (
    nextEntities: EntityRecord[],
    nextRelations: RelationRecord[],
    nextDocuments: DocumentRecord[],
    focusEntityId: string | null,
  ) => {
    if (!selectedSpaceId) {
      return;
    }

    const liveNodeById = new Map(
      nodes.map((node, index) => [
        node.id,
        {
          entityId: node.id,
          position: node.position,
          size:
            typeof node.width === 'number' && typeof node.height === 'number'
              ? { width: node.width, height: node.height }
              : null,
          zIndex: node.zIndex ?? index + 1,
          collapsed: false,
        },
      ]),
    );
    const persistedNodeById = new Map((canvasState?.nodes ?? []).map((node) => [node.entityId, node]));
    const liveEdgeById = new Map(edgeLayouts.map((layout) => [layout.relationId, layout]));
    const persistedEdgeById = new Map(
      (canvasState?.edges ?? []).map((layout) => [layout.relationId, layout]),
    );

    const nextCanvas: CanvasStateRecord = {
      spaceId: selectedSpaceId,
      groupId: activeSubspace.groupId,
      nodes: nextEntities.map(
        (entity, index) =>
          liveNodeById.get(entity.id) ??
          persistedNodeById.get(entity.id) ??
          createDefaultCanvasNodeLayout(entity.id, index),
      ),
      edges: nextRelations.map(
        (relation) =>
          liveEdgeById.get(relation.id) ??
          persistedEdgeById.get(relation.id) ?? {
            relationId: relation.id,
            fromEntityId: relation.fromEntityId,
            toEntityId: relation.toEntityId,
            controlPoints: [],
          },
      ),
      viewport,
      updatedAt: canvasState?.updatedAt ?? null,
    };

    const graph = buildCanvasGraph({
      entities: nextEntities,
      entityTypes,
      groups,
      groupNodePositions,
      onOpenGroup: setSelectedGroupId,
      relations: nextRelations,
      canvas: nextCanvas,
      selectedEntityId: focusEntityId,
    });

    setSpaceDocuments(nextDocuments);
    setEntities(nextEntities);
    setRelations(nextRelations);
    setCanvasState(nextCanvas);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setEdgeLayouts(nextCanvas.edges);
    selectEntityOnCanvas(focusEntityId);
    setCanvasError(null);
  };

  const refreshCanvasDataPreservingLayout = async (
    activeToken: string,
    spaceId: string,
    focusEntityId: string | null = selectedEntityId,
    groupId: string | null = activeSubspace.groupId,
  ) => {
    const [entitiesResponse, relationsResponse, documentsResponse] = await Promise.all([
      groupId
        ? canvasApi.listGroupEntities(activeToken, groupId)
        : canvasApi.listEntities(activeToken, spaceId),
      groupId
        ? canvasApi.listGroupRelations(activeToken, groupId)
        : canvasApi.listRelations(activeToken, spaceId),
      groupId
        ? canvasApi.listGroupDocuments(activeToken, groupId)
        : canvasApi.listDocuments(activeToken, spaceId),
    ]);

    applyCanvasDataPreservingLayout(
      entitiesResponse.items,
      relationsResponse.items,
      documentsResponse.items,
      focusEntityId,
    );
  };

  const hydrateDocumentEditor = (detail: DocumentDetailRecord | null, entity: EntityRecord) => {
    const draft = buildEntityDocumentDraft(entity, detail);

    setDocumentDetail(detail);
    setDocumentEditorDocumentId(detail?.document.id ?? null);
    setDocumentEditorTitle(draft.title);
    setDocumentEditorBody(draft.body);
  };

  const resolveEntityDocument = async (activeToken: string, entity: EntityRecord) => {
    try {
      const detail = await canvasApi.getEntityDocument(activeToken, entity.id);

      return isEntityOwnedDocument(detail, entity.id) ? detail : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить документ';

      if (message.startsWith('NOT_FOUND:')) {
        return null;
      }

      throw error;
    }
  };

  const navigateToEntityContext = async (
    activeToken: string,
    entityId: string,
    targetGroupId: string | null,
  ) => {
    if (!selectedSpaceId) {
      throw new Error('Не удалось определить текущее пространство для перехода по ссылке');
    }

    if (targetGroupId !== activeSubspace.groupId) {
      setSelectedGroupId(targetGroupId);
      await loadCanvas(activeToken, selectedSpaceId, entityId, targetGroupId);
      appendLog(
        targetGroupId
          ? `Переход в group: ${groupById.get(targetGroupId)?.slug ?? targetGroupId}`
          : 'Переход в root-контекст пространства',
      );
    } else {
      selectEntityOnCanvas(entityId);
    }

    return canvasApi.getEntity(activeToken, entityId);
  };

  const persistLayout = async (reason: string) => {
    if (!token || !selectedSpaceId || !canEditSelectedWorkspace) {
      return;
    }

    const payload = serializeCanvasState({
      spaceId: selectedSpaceId,
      nodes,
      edgeLayouts,
      viewport,
    }).payload;

    const saved = activeSubspace.groupId
      ? await canvasApi.saveGroupCanvas(token, activeSubspace.groupId, payload)
      : await canvasApi.saveCanvas(token, selectedSpaceId, payload);
    setCanvasState(saved);
    setEdgeLayouts(saved.edges);
    setViewport(saved.viewport);
    setLayoutDirty(false);
    await refreshWorkspaceActivity();
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
    if (!token || !selectedSpaceId || !canEditSelectedWorkspace) {
      return;
    }

    const title = quickEntityTitle.trim() || `Сущность ${entities.length + 1}`;
    const summary = quickEntitySummary.trim() || null;
    const created = activeSubspace.groupId
      ? await canvasApi.createGroupEntity(token, activeSubspace.groupId, {
          title,
          summary,
        })
      : await canvasApi.createEntity(token, selectedSpaceId, {
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

    const nextPayload = serializeCanvasState({
      spaceId: selectedSpaceId,
      nodes: nextNodes,
      edgeLayouts,
      viewport,
    }).payload;

    if (activeSubspace.groupId) {
      await canvasApi.saveGroupCanvas(token, activeSubspace.groupId, nextPayload);
    } else {
      await canvasApi.saveCanvas(token, selectedSpaceId, nextPayload);
    }

    await refreshWorkspaceActivity();
    appendLog(`Сущность создана из ${origin}: ${created.title}`);
    await loadCanvas(token, selectedSpaceId, created.id, activeSubspace.groupId);
  };

  const commitPendingEntityDeletion = async (snapshot: PendingEntityDeletion) => {
    const activeToken = tokenRef.current;
    const isActiveSpace =
      selectedSpaceIdRef.current === snapshot.entity.spaceId &&
      selectedGroupIdRef.current === (snapshot.entity.groupId ?? null);

    setPendingEntityDeletion((current) =>
      current?.entity.id === snapshot.entity.id ? null : current,
    );

    if (!activeToken) {
      if (isActiveSpace) {
        applyLocalCanvasState(restoreDeletedEntity(liveCanvasStateRef.current, snapshot));
      }
      return;
    }

    if (isActiveSpace) {
      setBusyLabel('Удаление записи');
    }

    try {
      await canvasApi.deleteEntity(activeToken, snapshot.entity.id);
      await refreshWorkspaceActivity();
      appendLog(`Запись удалена: ${snapshot.entity.id}`);
    } catch (error) {
      if (isActiveSpace) {
        applyLocalCanvasState(restoreDeletedEntity(liveCanvasStateRef.current, snapshot));
      }

      const message = error instanceof Error ? error.message : 'Не удалось удалить запись';
      appendLog(message);
      setCanvasError(message);
    } finally {
      if (isActiveSpace) {
        setBusyLabel(null);
      }
    }
  };

  const undoPendingEntityDeletion = () => {
    if (!activePendingDeletion) {
      return;
    }

    clearPendingEntityDeletionTimer();
    applyLocalCanvasState(restoreDeletedEntity(liveCanvasStateRef.current, activePendingDeletion));
    setPendingEntityDeletion(null);
    appendLog(`Запись восстановлена: ${activePendingDeletion.entity.id}`);
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    void withAction('Загрузка сессии', async () => {
      try {
        const user = await canvasApi.me(token);
        setCurrentUser(user);
        setEmail(user.email);
        await loadWorkspaces(token);
      } catch (error) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setCurrentUser(null);
        setCanvasError(null);
        setSessionFeedback({
          tone: 'error',
          message:
            error instanceof Error
              ? `Сессия истекла: ${error.message}`
              : 'Сессия истекла, войди снова.',
        });
        appendLog(
          error instanceof Error
            ? `Сессия истекла: ${error.message}`
            : 'Сессия истекла, войди снова',
        );
      }
    });
  }, [token]);

  useEffect(() => {
    if (!token || !selectedWorkspaceId) {
      setWorkspaceMembers([]);
      setActivityItems([]);
      setSpaces([]);
      setGroups([]);
      setSelectedSpaceId('');
      return;
    }

    void withAction('Загрузка пространств', async () => {
      await Promise.all([
        loadSpaces(token, selectedWorkspaceId),
        loadEntityTypes(token, selectedWorkspaceId),
        loadWorkspaceMembers(token, selectedWorkspaceId),
        loadWorkspaceActivity(token, selectedWorkspaceId),
      ]);
    });
  }, [selectedWorkspaceId, token]);

  useEffect(() => {
    if (!token || !selectedSpaceId) {
      setGroups([]);
      setSelectedGroupId(null);
      setDocumentDetail(null);
      setDocumentEditorDocumentId(null);
      setSpaceDocuments([]);
      setSavedViews([]);
      setActiveSavedViewId(null);
      setTableLensDraft(createDefaultTableDraft(entityTypes));
      return;
    }

    void loadGroups(token, selectedSpaceId);
  }, [selectedSpaceId, token]);

  useEffect(() => {
    if (!token || !selectedSpaceId) {
      setSavedViews([]);
      setActiveSavedViewId(null);
      setTableLensDraft(createDefaultTableDraft(entityTypes));
      return;
    }

    setSavedViews([]);
    setActiveSavedViewId(null);
    setTableLensDraft((current) => createDefaultTableDraft(entityTypes, current.viewType));
    void loadCanvas(token, selectedSpaceId, null, activeSubspace.groupId);
  }, [activeSubspace.groupId, entityTypes, selectedSpaceId, token]);

  useEffect(() => {
    if (!activeSavedViewId) {
      return;
    }

    const savedView = savedViews.find((view) => view.id === activeSavedViewId);

    if (!savedView) {
      return;
    }

    setTableLensDraft(buildDraftFromSavedView(savedView, entityTypes));
  }, [activeSavedViewId, entityTypes, savedViews]);

  useEffect(() => {
    if (!documentEditorEntityId) {
      setDocumentDetail(null);
      setDocumentEditorDocumentId(null);
      setDocumentEditorTitle('');
      setDocumentEditorBody([]);
      return;
    }
  }, [documentEditorEntityId]);

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
        const message = error instanceof Error ? error.message : 'Не удалось загрузить обратные ссылки';
        appendLog(message);
        setDocumentBacklinks([]);
      });
  }, [selectedEntityId, token]);

  useEffect(() => {
    if (!token || !selectedSpaceId || !documentEditorEntityId) {
      setDocumentDefinitionDocuments([]);
      return;
    }

    let cancelled = false;

    void loadDocumentDefinitionDocuments(token, selectedSpaceId).catch((error) => {
      if (cancelled) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Не удалось загрузить cross-subspace ссылки';
      appendLog(message);
      setDocumentDefinitionDocuments([]);
    });

    return () => {
      cancelled = true;
    };
  }, [documentEditorEntityId, groups, selectedSpaceId, token]);

  useEffect(() => {
    setEntityTypeDraft(buildEntityTypeDraft(activeSchemaType));
  }, [activeSchemaType]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        if (!isCanvasEntityNode(node)) {
          return node;
        }

        const entity = entities.find((item) => item.id === node.id);
        const nextTypeName = entity?.entityTypeId
          ? entityTypes.find((item) => item.id === entity.entityTypeId)?.name ?? 'Типизированная запись'
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
      try {
        setSessionFeedback({
          tone: 'info',
          message: 'Пробую зарегистрировать аккаунт...',
        });
        const session = await canvasApi.register({
          email,
          password,
          displayName,
        });
        syncSession(session);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось зарегистрироваться';
        const canLogin =
          typeof error === 'object' &&
          error !== null &&
          'details' in error &&
          typeof (error as { details?: { canLogin?: unknown } }).details?.canLogin === 'boolean' &&
          (error as { details?: { canLogin?: boolean } }).details?.canLogin === true;

        if (canLogin || message.startsWith('CONFLICT:')) {
          setSessionFeedback({
            tone: 'info',
            message: 'Аккаунт уже существует. Пробую выполнить вход с этим email.',
          });
          appendLog('Аккаунт уже существует, пробую выполнить вход.');
          try {
            const session = await canvasApi.login({
              email,
              password,
            });
            syncSession(session);
          } catch (loginError) {
            setSessionFeedback({
              tone: 'error',
              message:
                loginError instanceof Error
                  ? `Аккаунт уже существует, но войти не удалось: ${loginError.message}`
                  : 'Аккаунт уже существует, но войти не удалось. Проверь пароль.',
            });
            throw new Error(
              loginError instanceof Error
                ? `Аккаунт уже существует. Если это твой email, войди с прежним паролем: ${loginError.message}`
                : 'Аккаунт уже существует. Войди с прежним паролем.',
            );
          }
          return;
        }

        setSessionFeedback({
          tone: 'error',
          message:
            error instanceof Error
              ? `Не удалось зарегистрироваться: ${error.message}`
              : 'Не удалось зарегистрироваться.',
        });
        throw error;
      }
    });

  const authenticateLogin = () =>
    withAction('Вход', async () => {
      try {
        setSessionFeedback({
          tone: 'info',
          message: 'Выполняю вход...',
        });
        const session = await canvasApi.login({
          email,
          password,
        });
        syncSession(session);
      } catch (error) {
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : null;

        setSessionFeedback({
          tone: 'error',
          message:
            errorCode === 'UNAUTHORIZED'
              ? 'Не удалось войти. Проверь email и пароль.'
              : error instanceof Error
                ? `Не удалось войти: ${error.message}`
                : 'Не удалось войти.',
        });
        throw error;
      }
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

  const inviteWorkspaceMember = () =>
    withAction('Добавление участника', async () => {
      if (!token || !selectedWorkspaceId || !canManageSelectedWorkspace) {
        return;
      }

      const member = await canvasApi.inviteWorkspaceMember(token, selectedWorkspaceId, {
        email: inviteMemberEmail.trim(),
        role: inviteMemberRole,
      });
      setInviteMemberEmail('');
      setWorkspaceMembers((current) => [
        member,
        ...current.filter((item) => item.id !== member.id),
      ]);
      await refreshWorkspaceActivity();
      appendLog(`Участник добавлен: ${member.user.email}`);
    });

  const changeWorkspaceMemberRole = (membershipId: string, role: 'editor' | 'viewer') =>
    withAction('Обновление роли участника', async () => {
      if (!token || !canManageSelectedWorkspace) {
        return;
      }

      const member = await canvasApi.updateWorkspaceMemberRole(token, membershipId, {
        role,
      });
      setWorkspaceMembers((current) =>
        current.map((item) => (item.id === member.id ? member : item)),
      );
      await refreshWorkspaceActivity();
      appendLog(`Роль обновлена: ${member.user.email}`);
    });

  const createSpace = () =>
    withAction('Создание пространства', async () => {
      if (!token || !selectedWorkspaceId || !canManageSelectedWorkspace) {
        return;
      }

      const space = await canvasApi.createSpace(token, selectedWorkspaceId, {
        name: spaceName,
        slug: spaceSlug,
      });
      appendLog(`Пространство создано: ${space.slug}`);
      await loadSpaces(token, selectedWorkspaceId);
      await refreshWorkspaceActivity();
      setSelectedSpaceId(space.id);
    });

  const createGroup = () =>
    withAction('Создание subspace-группы', async () => {
      if (!token || !selectedSpaceId || !canManageSelectedWorkspace) {
        return;
      }

      const group = await canvasApi.createGroup(token, selectedSpaceId, {
        name: groupName,
        slug: groupSlug,
        description: groupDescription,
      });
      setGroups((current) => [group, ...current.filter((item) => item.id !== group.id)]);
      setSelectedGroupId(group.id);
      await refreshWorkspaceActivity();
      appendLog(`Группа создана: ${group.slug}`);
    });

  const quickCreateCenteredEntity = () =>
    withAction('Создание сущности', async () => {
      await createEntityAtPosition(getCanvasCenterPosition(), 'панели');
    });

  const resetTableLensDraft = (viewType: StructuredViewDraft['viewType'] = tableLensDraft.viewType) => {
    setActiveSavedViewId(null);
    setTableLensDraft(createDefaultTableDraft(entityTypes, viewType));
  };

  const selectSavedView = (savedViewId: string | null) => {
    if (!savedViewId) {
      resetTableLensDraft();
      return;
    }

    const savedView = savedViews.find((view) => view.id === savedViewId);

    if (!savedView) {
      resetTableLensDraft();
      return;
    }

    setActiveSavedViewId(savedView.id);
    setTableLensDraft(buildDraftFromSavedView(savedView, entityTypes));
  };

  const createSavedView = async (payload: {
    name: string;
    description?: string | null;
    entityTypeId?: string | null;
    viewType: SavedViewRecord['viewType'];
    config: SavedViewRecord['config'];
  }) => {
    if (!token || !selectedSpaceId || !canEditSelectedWorkspace) {
      throw new Error('Выбери пространство перед сохранением представления.');
    }

    const created = activeSubspace.groupId
      ? await canvasApi.createGroupSavedView(token, activeSubspace.groupId, payload)
      : await canvasApi.createSavedView(token, selectedSpaceId, payload);
    setSavedViews((current) => [created, ...current.filter((view) => view.id !== created.id)]);
    setActiveSavedViewId(created.id);
    setTableLensDraft(buildDraftFromSavedView(created, entityTypes));
    await refreshWorkspaceActivity();
    appendLog(`Saved view создан: ${created.name}`);

    return created;
  };

  const updateSavedView = async (
    savedViewId: string,
    payload: {
      name?: string;
      description?: string | null;
      entityTypeId?: string | null;
      viewType?: SavedViewRecord['viewType'];
      config?: SavedViewRecord['config'];
    },
  ) => {
    if (!token || !canEditSelectedWorkspace) {
      throw new Error('Сначала авторизуйся.');
    }

    const updated = await canvasApi.updateSavedView(token, savedViewId, payload);
    setSavedViews((current) =>
      current.map((savedView) => (savedView.id === savedViewId ? updated : savedView)),
    );
    setActiveSavedViewId(updated.id);
    setTableLensDraft(buildDraftFromSavedView(updated, entityTypes));
    await refreshWorkspaceActivity();
    appendLog(`Saved view обновлён: ${updated.name}`);

    return updated;
  };

  const deleteSavedView = async (savedViewId: string) => {
    if (!token || !canEditSelectedWorkspace) {
      throw new Error('Сначала авторизуйся.');
    }

    await canvasApi.deleteSavedView(token, savedViewId);
    setSavedViews((current) => current.filter((savedView) => savedView.id !== savedViewId));
    setActiveSavedViewId((current) => (current === savedViewId ? null : current));
    setTableLensDraft((current) => createDefaultTableDraft(entityTypes, current.viewType));
    await refreshWorkspaceActivity();
    appendLog('Saved view удалён');
  };

  const onNodesChange = (changes: NodeChange[]) => {
    const nodeTypeById = new Map(nodes.map((node) => [node.id, node.type]));
    const entityNodeChanged = changes.some((change) => {
      const nodeId = 'id' in change ? change.id : null;
      return !!nodeId && nodeTypeById.get(nodeId) === 'entityCard';
    });

    setNodes((current) => applyNodeChanges<CanvasNodeData>(changes, current));

    if (entityNodeChanged) {
      setLayoutDirty(true);
    }
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  };

  const persistOpenDocument = async () => {
    if (!token || !selectedSpaceId || !documentEditorEntity || !canEditSelectedWorkspace) {
      return null;
    }

    const payload = buildEntityDocumentPayload(documentEditorEntity, {
      title: documentEditorTitle,
      body: documentEditorBody,
    });

    setDocumentSaveBusy(true);

    try {
      const detail = await canvasApi.upsertEntityDocument(token, documentEditorEntity.id, payload);

      hydrateDocumentEditor(detail, documentEditorEntity);
      await refreshWorkspaceActivity();
      appendLog(`Р”РѕРєСѓРјРµРЅС‚ СЃРѕС…СЂР°РЅС‘РЅ: ${detail.document.title}`);
      await refreshCanvasDataPreservingLayout(token, selectedSpaceId, documentEditorEntity.id);
      await loadDocumentDefinitionDocuments(token, selectedSpaceId);

      if (selectedEntityId === documentEditorEntity.id) {
        const backlinks = await canvasApi.listDocumentBacklinks(token, documentEditorEntity.id);
        setDocumentBacklinks(backlinks.items);
      }

      return detail;
    } finally {
      setDocumentSaveBusy(false);
    }
  };

  const openEntityDocument = (entityId: string) => {
    const entity = entities.find((item) => item.id === entityId);

    if (!token || !entity) {
      return;
    }

    selectEntityOnCanvas(entityId);
    setDocumentEditorEntityId(entityId);
    setDocumentLoading(true);

    void withAction('Открытие документа', async () => {
      try {
        const detail = await resolveEntityDocument(token, entity);
        hydrateDocumentEditor(detail, entity);
      } finally {
        setDocumentLoading(false);
      }
    });
  };

  const closeEntityDocument = () => {
    setDocumentEditorEntityId(null);
    setDocumentEditorDocumentId(null);
    setDocumentDetail(null);
    setDocumentEditorTitle('');
    setDocumentEditorBody([]);
    setDocumentLoading(false);
  };

  const saveEntityDocument = () =>
    withAction('Сохранение документа', async () => {
      const activeToken = token;
      const activeSpaceId = selectedSpaceId;
      const activeEntity = documentEditorEntity;

      if (!activeToken || !activeSpaceId || !activeEntity || !canEditSelectedWorkspace) {
        return;
      }
      await persistOpenDocument();
      return;

      const payload = buildEntityDocumentPayload(activeEntity!, {
        title: documentEditorTitle,
        body: documentEditorBody,
      });

      setDocumentSaveBusy(true);

      try {
        const detail = await canvasApi.upsertEntityDocument(activeToken!, activeEntity!.id, payload);

        hydrateDocumentEditor(detail, activeEntity!);
        appendLog(`Документ сохранён: ${detail.document.title}`);
        await loadCanvas(activeToken!, activeSpaceId!, activeEntity!.id);

        if (selectedEntityId === activeEntity!.id) {
          const backlinks = await canvasApi.listDocumentBacklinks(activeToken!, activeEntity!.id);
          setDocumentBacklinks(backlinks.items);
        }
      } finally {
        setDocumentSaveBusy(false);
      }
    });

  const deleteSelectedEntity = () => {
    if (!token || !selectedSpaceId || !selectedEntityId || pendingEntityDeletion || !canEditSelectedWorkspace) {
      return;
    }

    const stagedDeletion = stageEntityDeletion(liveCanvasStateRef.current, selectedEntityId);

    if (!stagedDeletion) {
      return;
    }

    clearPendingEntityDeletionTimer();
    setPendingEntityDeletion(stagedDeletion.pendingDeletion);
    applyLocalCanvasState(stagedDeletion.nextState);
    appendLog(`Запись скрыта до подтверждения удаления: ${selectedEntityId}`);
    pendingEntityDeletionTimerRef.current = window.setTimeout(() => {
      pendingEntityDeletionTimerRef.current = null;
      void commitPendingEntityDeletion(stagedDeletion.pendingDeletion);
    }, ENTITY_DELETE_UNDO_WINDOW_MS);
  };

  const openDocumentFromBacklink = async (documentId: string) => {
    if (!token) {
      return;
    }

    void withAction('Открытие связанного документа', async () => {
      setDocumentLoading(true);

      try {
        const detail = await canvasApi.getDocument(token, documentId);
        const ownerEntityId = getEntityDocumentOwnerEntityId(detail);
        const ownerEntity = ownerEntityId
          ? await canvasApi.getEntity(token, ownerEntityId)
          : null;

        if (!ownerEntity) {
          throw new Error('Не удалось определить запись, которой принадлежит документ');
        }

        selectEntityOnCanvas(ownerEntity.id);
        setDocumentEditorEntityId(ownerEntity.id);
        hydrateDocumentEditor(detail, ownerEntity);
      } finally {
        setDocumentLoading(false);
      }
    });
  };

  const openEntityDocumentWithAutosave = (
    entityId: string,
    targetGroupId: string | null = activeSubspace.groupId,
  ) => {
    if (!token) {
      return;
    }

    void withAction('РћС‚РєСЂС‹С‚РёРµ РґРѕРєСѓРјРµРЅС‚Р°', async () => {
      if (
        documentEditorEntity &&
        documentEditorEntity.id !== entityId &&
        documentEditorDirty &&
        selectedSpaceId
      ) {
        await persistOpenDocument();
      }

      setDocumentDetail(null);
      setDocumentEditorDocumentId(null);
      setDocumentEditorTitle('');
      setDocumentEditorBody([]);
      setDocumentLoading(true);

      try {
        const entity =
          targetGroupId === activeSubspace.groupId
            ? entities.find((item) => item.id === entityId) ??
              (await navigateToEntityContext(token, entityId, targetGroupId))
            : await navigateToEntityContext(token, entityId, targetGroupId);

        setDocumentEditorEntityId(entity.id);
        setDocumentEditorTitle(entity.title);
        const detail = await resolveEntityDocument(token, entity);
        hydrateDocumentEditor(detail, entity);
      } finally {
        setDocumentLoading(false);
      }
    });
  };

  const closeEntityDocumentWithAutosave = () => {
    if (documentEditorDirty && documentEditorEntity && token && selectedSpaceId) {
      void withAction('Р—Р°РєСЂС‹С‚РёРµ РґРѕРєСѓРјРµРЅС‚Р°', async () => {
        await persistOpenDocument();
        closeEntityDocument();
      });
      return;
    }

    closeEntityDocument();
  };

  const openDocumentFromBacklinkWithAutosave = (backlink: DocumentBacklinkRecord) => {
    if (!token) {
      return;
    }

    void withAction('РћС‚РєСЂС‹С‚РёРµ СЃРІСЏР·Р°РЅРЅРѕРіРѕ РґРѕРєСѓРјРµРЅС‚Р°', async () => {
      if (
        documentEditorEntity &&
        documentEditorDocumentId !== backlink.documentId &&
        documentEditorDirty &&
        selectedSpaceId
      ) {
        await persistOpenDocument();
      }

      setDocumentDetail(null);
      setDocumentEditorDocumentId(null);
      setDocumentEditorTitle('');
      setDocumentEditorBody([]);
      setDocumentLoading(true);

      try {
        const ownerEntity = await navigateToEntityContext(
          token,
          backlink.sourceEntityId,
          backlink.sourceGroupId,
        );
        const detail = await canvasApi.getDocument(token, backlink.documentId);

        if (!ownerEntity) {
          throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ Р·Р°РїРёСЃСЊ, РєРѕС‚РѕСЂРѕР№ РїСЂРёРЅР°РґР»РµР¶РёС‚ РґРѕРєСѓРјРµРЅС‚');
        }

        selectEntityOnCanvas(ownerEntity.id);
        setDocumentEditorEntityId(ownerEntity.id);
        hydrateDocumentEditor(detail, ownerEntity);
      } finally {
        setDocumentLoading(false);
      }
    });
  };

  useEffect(() => {
    localStorage.setItem(LAST_EMAIL_STORAGE_KEY, email);
  }, [email]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    selectedSpaceIdRef.current = selectedSpaceId;
  }, [selectedSpaceId]);

  useEffect(() => {
    selectedGroupIdRef.current = activeSubspace.groupId;
  }, [activeSubspace.groupId]);

  useEffect(() => {
    liveCanvasStateRef.current = {
      spaceId: selectedSpaceId,
      groupId: activeSubspace.groupId,
      entityTypes,
      entities,
      relations,
      nodes: entityNodes,
      edgeLayouts,
      viewport,
      canvasUpdatedAt: canvasState?.updatedAt ?? null,
      documents: spaceDocuments,
      selectedEntityId,
    };
  }, [
    canvasState,
    edgeLayouts,
    entityNodes,
    entities,
    entityTypes,
    relations,
    selectedEntityId,
    selectedSpaceId,
    spaceDocuments,
    viewport,
    activeSubspace.groupId,
  ]);

  useEffect(() => {
    return () => {
      clearPendingEntityDeletionTimer();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isDeleteShortcut = event.key === 'Delete';
      const isUndoShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z';

      if (!isDeleteShortcut && !isUndoShortcut) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? '';
      const isEditable =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable === true;

      if (isEditable) {
        return;
      }

      if (isUndoShortcut) {
        if (!activePendingDeletion || busyLabel) {
          return;
        }

        event.preventDefault();
        undoPendingEntityDeletion();
        return;
      }

      if (
        documentEditorEntityId ||
        !selectedEntityId ||
        !token ||
        !selectedSpaceId ||
        busyLabel ||
        pendingEntityDeletion
      ) {
        return;
      }

      event.preventDefault();
      deleteSelectedEntity();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePendingDeletion, busyLabel, documentEditorEntityId, pendingEntityDeletion, selectedEntityId, selectedSpaceId, token]);

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
      if (!token || !selectedSpaceId || !selectedEntity || !entityDetailDraft || !canEditSelectedWorkspace) {
        return;
      }

      setEntitySaveBusy(true);

      try {
        const payload = buildEntityUpdatePayload(entityDetailDraft, entityTypes);
        const updated = await canvasApi.updateEntity(token, selectedEntity.id, payload);
        await refreshWorkspaceActivity();
        appendLog(`Запись обновлена: ${updated.title}`);
        await loadCanvas(token, selectedSpaceId, updated.id);
      } finally {
        setEntitySaveBusy(false);
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
      if (!token || !selectedWorkspaceId || !canManageSelectedWorkspace) {
        return;
      }

      const payload = serializeEntityTypeDraft(entityTypeDraft);

      if (!payload.name || !payload.slug) {
        throw new Error('Нужны название типа и slug');
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
        await refreshWorkspaceActivity();
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
            <option value="">Не задано</option>
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
            placeholder="значение 1, значение 2"
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
          <span className="eyebrow">Ryba S-8 permissions + activity</span>
          <h1>Workspace для команды с базовыми ролями и видимой историей действий</h1>
          <p>
            На этом этапе workspace становится пригодным для маленькой команды: owner управляет
            участниками и структурой, editor меняет контент, viewer остаётся в read-only, а ключевые
            действия складываются в общую activity ленту.
          </p>
        </div>
        <div className="s3-hero__stats">
          <div>
            <span>Рабочее пространство</span>
            <strong>{selectedWorkspace?.slug ?? 'не выбрано'}</strong>
          </div>
          <div>
            <span>Текущая роль</span>
            <strong>{workspaceCapabilities.roleLabel}</strong>
          </div>
          <div>
            <span>Пространство</span>
            <strong>{selectedSpace?.slug ?? 'не выбрано'}</strong>
          </div>
          <div>
            <span>Записи / связи</span>
            <strong>{entities.length} / {relations.length}</strong>
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
            <p className="panel__hint">
              Можно повторно использовать тот же email после перезапуска. Если аккаунт уже существует, регистрация
              автоматически попробует сразу выполнить вход.
            </p>
            <label className="field">
              <span>Почта</span>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setSessionFeedback(null);
                  setEmail(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setSessionFeedback(null);
                  setPassword(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span>Отображаемое имя</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => {
                  setSessionFeedback(null);
                  setDisplayName(event.target.value);
                }}
              />
            </label>
            <div className="actions">
              <button type="button" className="button" disabled={!!busyLabel} onClick={authenticateRegister}>
                Зарегистрироваться / войти
              </button>
              <button type="button" className="button button--ghost" disabled={!!busyLabel} onClick={authenticateLogin}>
                Войти
              </button>
            </div>
            {sessionFeedback ? (
              <p className={`panel__notice panel__notice--${sessionFeedback.tone}`} role="status">
                {sessionFeedback.message}
              </p>
            ) : null}
            <button type="button" className="button button--ghost button--full" disabled={!token} onClick={clearSession}>
              Очистить сессию
            </button>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Доступ workspace</h2>
              <span>{selectedWorkspace ? workspaceCapabilities.roleLabel : 'не выбрано'}</span>
            </div>
            {!selectedWorkspaceId ? (
              <p className="panel__hint">
                Выбери workspace, чтобы увидеть текущую роль, участников команды и общую activity ленту.
              </p>
            ) : (
              <>
                <p className="panel__notice panel__notice--info">
                  Текущая роль: <strong>{workspaceCapabilities.roleLabel}</strong>. {workspaceAccessSummary}
                </p>

                <div className="workspace-member-list">
                  {workspaceMembers.map((member) => {
                    const memberRoleLabel = getWorkspaceCapabilities(member.role).roleLabel;
                    const memberName = member.user.displayName?.trim() || member.user.email;
                    const isOwnerMember = member.role === 'owner';

                    return (
                      <article key={member.id} className="workspace-member-card">
                        <div className="workspace-member-card__identity">
                          <strong>{memberName}</strong>
                          <span>{member.user.email}</span>
                        </div>
                        <div className="workspace-member-card__actions">
                          <span className="status-pill">{memberRoleLabel}</span>
                          {canManageSelectedWorkspace && !isOwnerMember ? (
                            <select
                              value={member.role}
                              disabled={!!busyLabel}
                              onChange={(event) =>
                                void changeWorkspaceMemberRole(
                                  member.id,
                                  event.target.value as 'editor' | 'viewer',
                                )
                              }
                            >
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="button button--ghost button--full"
                  disabled={!!busyLabel}
                  onClick={() =>
                    void withAction('Обновление доступа workspace', async () => {
                      await Promise.all([refreshWorkspaceMembers(), refreshWorkspaceActivity()]);
                    })
                  }
                >
                  Обновить участников и activity
                </button>

                {canManageSelectedWorkspace ? (
                  <>
                    <label className="field">
                      <span>Email участника</span>
                      <input
                        type="email"
                        value={inviteMemberEmail}
                        disabled={!!busyLabel}
                        onChange={(event) => setInviteMemberEmail(event.target.value)}
                        placeholder="member@ryba.local"
                      />
                    </label>
                    <label className="field">
                      <span>Роль</span>
                      <select
                        value={inviteMemberRole}
                        disabled={!!busyLabel}
                        onChange={(event) =>
                          setInviteMemberRole(event.target.value as 'editor' | 'viewer')
                        }
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button button--full"
                      disabled={!!busyLabel || inviteMemberEmail.trim().length === 0}
                      onClick={inviteWorkspaceMember}
                    >
                      Добавить участника
                    </button>
                  </>
                ) : (
                  <p className="panel__hint">
                    Состав команды меняет только owner. Editor и viewer видят состав и ленту событий.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Слой схемы</h2>
              <span>{activeSchemaType ? activeSchemaType.slug : 'новый тип'}</span>
            </div>
            <p className="panel__hint">
              {canManageSelectedWorkspace
                ? 'Типы сущностей и поля меняет только owner, потому что это часть структуры workspace.'
                : 'Схема доступна для просмотра, но менять типы и поля в S-8 может только owner.'}
            </p>
            <label className="field">
              <span>Активный тип</span>
              <select
                value={activeSchemaTypeId}
                onChange={(event) => setActiveSchemaTypeId(event.target.value)}
                disabled={!token || !selectedWorkspaceId || !!busyLabel || schemaSaveBusy}
              >
                <option value="">Новый тип сущности</option>
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
                disabled={
                  !token ||
                  !selectedWorkspaceId ||
                  !!busyLabel ||
                  schemaSaveBusy ||
                  !canManageSelectedWorkspace
                }
              >
                Новый тип
              </button>
              <button
                type="button"
                className="button"
                onClick={saveSchemaLayer}
                disabled={
                  !token ||
                  !selectedWorkspaceId ||
                  !!busyLabel ||
                  schemaSaveBusy ||
                  !canManageSelectedWorkspace
                }
              >
                {schemaSaveBusy ? 'Сохраняю...' : 'Сохранить тип'}
              </button>
            </div>
            <fieldset
              className="panel__fieldset"
              disabled={
                !token ||
                !selectedWorkspaceId ||
                !!busyLabel ||
                schemaSaveBusy ||
                !canManageSelectedWorkspace
              }
            >
              <label className="field">
                <span>Название типа</span>
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
                <span>Описание</span>
                <textarea
                  rows={2}
                  value={entityTypeDraft.description}
                  onChange={(event) => updateEntityTypeDraft({ description: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Цветовой токен</span>
                <input
                  type="text"
                  value={entityTypeDraft.color}
                  onChange={(event) => updateEntityTypeDraft({ color: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Иконка</span>
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
                      <span>Подпись</span>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(event) => updateSchemaField(index, { label: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Ключ</span>
                      <input
                        type="text"
                        value={field.key}
                        onChange={(event) => updateSchemaField(index, { key: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Тип поля</span>
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
                      <span>Варианты (через запятую)</span>
                      <input
                        type="text"
                        value={field.optionsText}
                        onChange={(event) =>
                          updateSchemaField(index, { optionsText: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Описание</span>
                      <input
                        type="text"
                        value={field.description}
                        onChange={(event) =>
                          updateSchemaField(index, { description: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>ID типа связи</span>
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
                      <span>Обязательное</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={field.allowMultiple}
                        onChange={(event) =>
                          updateSchemaField(index, { allowMultiple: event.target.checked })
                        }
                      />
                      <span>Разрешить несколько значений</span>
                    </label>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => removeSchemaField(index)}
                    >
                      Удалить поле
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="button button--ghost button--full"
                onClick={addSchemaField}
              >
                Добавить поле
              </button>
            </fieldset>
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
            {selectedWorkspaceId ? (
              <p className="panel__hint">
                Роль в текущем workspace: {workspaceCapabilities.roleLabel}. {workspaceAccessSummary}
              </p>
            ) : null}
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
              <button
                type="button"
                className="button"
                disabled={
                  !token ||
                  !selectedWorkspaceId ||
                  !!busyLabel ||
                  !canManageSelectedWorkspace
                }
                onClick={createSpace}
              >
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
            {selectedSpaceId ? (
              <>
                <label className="field">
                  <span>Текущий subspace</span>
                  <select
                    value={selectedGroupId ?? ''}
                    onChange={(event) => setSelectedGroupId(event.target.value || null)}
                  >
                    <option value="">Корневой контекст пространства</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <p className="panel__hint">
                  {selectedGroup
                    ? `Сейчас открыт локальный контекст "${selectedGroup.name}". Внутри него канва, документы и saved views изолированы от корня space.`
                    : 'Сейчас открыт корневой контекст пространства. Выбери group, чтобы провалиться во внутренний subspace.'}
                </p>
                <label className="field">
                  <span>Название group</span>
                  <input type="text" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
                </label>
                <label className="field">
                  <span>Слаг group</span>
                  <input
                    type="text"
                    value={groupSlug}
                    onChange={(event) => setGroupSlug(event.target.value.toLowerCase())}
                  />
                </label>
                <label className="field">
                  <span>Описание group</span>
                  <textarea
                    rows={3}
                    value={groupDescription}
                    onChange={(event) => setGroupDescription(event.target.value)}
                  />
                </label>
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    disabled={!token || !selectedSpaceId || !!busyLabel || !canManageSelectedWorkspace}
                    onClick={createGroup}
                  >
                    Создать group
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={!selectedGroupId || !!busyLabel}
                    onClick={() => setSelectedGroupId(null)}
                  >
                    Выйти в space
                  </button>
                </div>
              </>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Действия канвы</h2>
              <span>
                {selectedGroup
                  ? `group: ${selectedGroup.slug}`
                  : canvasState?.updatedAt
                    ? 'сохранено'
                    : 'вид по умолчанию'}
              </span>
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
            <div className="actions">
              <button
                type="button"
                className="button"
                disabled={!token || !selectedSpaceId || !!busyLabel || !canEditSelectedWorkspace}
                onClick={quickCreateCenteredEntity}
              >
                Добавить в центр
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={
                  !token ||
                  !selectedSpaceId ||
                  !!busyLabel ||
                  !layoutDirty ||
                  !!activePendingDeletion ||
                  !canEditSelectedWorkspace
                }
                onClick={() => void withAction('Сохранение макета', () => persistLayout('ручное сохранение'))}
              >
                Сохранить макет
              </button>
            </div>
            {!canEditSelectedWorkspace && selectedWorkspaceId ? (
              <p className="panel__hint">
                Текущая роль открывает канву в read-only: можно смотреть контекст, но нельзя менять layout и создавать записи.
              </p>
            ) : null}
            {activePendingDeletion ? (
              <>
                <p className="panel__hint">
                  Запись "{activePendingDeletion.entity.title}" удалена локально. Нажми Ctrl+Z,
                  чтобы вернуть её до окончательного удаления.
                </p>
                <button
                  type="button"
                  className="button button--ghost button--full"
                  disabled={!!busyLabel}
                  onClick={undoPendingEntityDeletion}
                >
                  Вернуть запись (Ctrl+Z)
                </button>
              </>
            ) : null}
            <p className="panel__hint">
              Создавай сущность кнопкой в этой панели. Двойной клик по ноде открывает документ на весь экран.
              Ссылки вставляются через список сущностей и кнопку вставки ссылки в редакторе, а связи появляются после
              сохранения документа.
            </p>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Детали записи</h2>
              <span>{selectedEntity ? selectedEntity.title : 'ничего не выбрано'}</span>
            </div>
            {selectedEntity && entityDetailDraft ? (
              <div className="detail-form">
                <div className="detail-form__meta">
                  <strong>{selectedEntity.id}</strong>
                  <span>{relatedToSelectedEntity.length} связей</span>
                </div>
                {!canEditSelectedWorkspace ? (
                  <p className="panel__hint">
                    Запись открыта в режиме чтения. Owner и editor могут менять поля, viewer только читает.
                  </p>
                ) : null}
                <fieldset
                  className="panel__fieldset"
                  disabled={!token || !selectedSpaceId || !!busyLabel || entitySaveBusy || !canEditSelectedWorkspace}
                >
                  <label className="field">
                    <span>Тип сущности</span>
                    <select
                      value={entityDetailDraft.entityTypeId ?? ''}
                      onChange={(event) => handleDetailEntityTypeChange(event.target.value)}
                    >
                      <option value="">Без типа</option>
                      {entityTypes.map((entityType) => (
                        <option key={entityType.id} value={entityType.id}>
                          {entityType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Заголовок</span>
                    <input
                      type="text"
                      value={entityDetailDraft.title}
                      onChange={(event) => updateDetailDraft({ title: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Краткое описание</span>
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
                        У этой записи пока нет типизированных полей. Выбери тип или добавь их в слое схемы.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button--full"
                    onClick={saveEntityDetail}
                    disabled={!token || !selectedSpaceId || !!busyLabel || entitySaveBusy || !canEditSelectedWorkspace}
                  >
                    {entitySaveBusy ? 'Сохраняю...' : 'Сохранить запись'}
                  </button>
                </fieldset>
                <div className="document-preview-list">
                  <div className="panel__header">
                    <h2>Обратные ссылки</h2>
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
                        onClick={() => openDocumentFromBacklinkWithAutosave(backlink)}
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
                Выбери ноду на канве, чтобы открыть данные сущности. Двойной клик по ноде открывает её документ.
              </p>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Лента workspace</h2>
              <span>{activityItems.length}</span>
            </div>
            <ul className="compact-list">
              {!selectedWorkspaceId ? <li>Выбери workspace, чтобы увидеть server-side activity.</li> : null}
              {selectedWorkspaceId && activityItems.length === 0 ? <li>Событий workspace пока не было.</li> : null}
              {activityItems.map((item) => {
                const actorName = item.actor.displayName?.trim() || item.actor.email;

                return (
                  <li key={item.id}>
                    <strong>{item.summary}</strong>
                    <span>
                      {actorName} · {item.eventType} · {formatActivityTimestamp(item.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {logLines.length > 0 ? (
              <>
                <p className="panel__hint">Локальная сессия</p>
                <ul className="compact-list">
                  {logLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </aside>

        <section className="canvas-stage">
          <TableView
            entities={entities}
            entityTypes={entityTypes}
            currentUser={currentUser}
            draft={tableLensDraft}
            activeSavedViewId={activeSavedViewId}
            savedViews={savedViews}
            loading={canvasLoading}
            disabled={!token || !selectedSpaceId}
            persistDisabled={!canEditSelectedWorkspace}
            busy={!!busyLabel}
            selectedEntityId={selectedEntityId}
            onDraftChange={setTableLensDraft}
            onSelectEntity={selectEntityOnCanvas}
            onSelectSavedView={selectSavedView}
            onCreateSavedView={(name) => {
              void createSavedView({
                ...serializeStructuredViewDraft(
                  {
                    ...tableLensDraft,
                    name,
                  },
                  entityTypes,
                ),
              });
            }}
            onOverwriteSavedView={(savedViewId) => {
              void updateSavedView(savedViewId, serializeStructuredViewDraft(tableLensDraft, entityTypes));
            }}
            onDeleteSavedView={(savedViewId) => {
              void deleteSavedView(savedViewId);
            }}
            onResetSavedViewDraft={() => {
              if (activeSavedViewId) {
                selectSavedView(activeSavedViewId);
                return;
              }

              resetTableLensDraft();
            }}
          />

          <div className="canvas-toolbar">
            <div className="canvas-toolbar__copy">
              <strong>{selectedSpace?.name ?? 'Выбери пространство'}</strong>
              <span>
                {canvasLoading
                  ? 'Загрузка канвы...'
                  : selectedSpace
                    ? 'Сверху доступна структурированная линза space, снизу остаётся канва для spatial-навигации, раскладки и документных переходов.'
                    : 'Создай пространство или выбери существующее, чтобы открыть канву.'}
              </span>
            </div>
            <div className="canvas-toolbar__actions">
              {selectedGroup ? (
                <button
                  type="button"
                  className="button button--ghost canvas-toolbar__back"
                  disabled={!!busyLabel}
                  onClick={() => setSelectedGroupId(null)}
                >
                  ← Выйти в space
                </button>
              ) : null}
              <button
                type="button"
                className="button button--ghost"
                disabled={!token || !selectedSpaceId || !!busyLabel || !!activePendingDeletion}
                onClick={() => token && selectedSpaceId && void withAction('Обновление канвы', () => loadCanvas(token, selectedSpaceId))}
              >
                Обновить канву
              </button>
              <span className={`status-pill${layoutDirty ? ' is-warning' : ''}`}>
                {layoutDirty ? 'Макет не сохранён' : canvasState?.updatedAt ? 'Макет сохранён' : 'Макет по умолчанию'}
              </span>
            </div>
          </div>

          <div className="canvas-shell" ref={flowWrapperRef}>
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
                nodesDraggable={canEditSelectedWorkspace}
                onInit={setFlowInstance}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
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
                  if (node.type === 'groupCard') {
                    setSelectedEntityId(null);
                    return;
                  }

                  selectEntityOnCanvas(node.id);
                }}
                onNodeDoubleClick={(_, node) => {
                  if (node.type === 'groupCard') {
                    setSelectedGroupId(node.id);
                    return;
                  }

                  openEntityDocumentWithAutosave(node.id);
                }}
                onNodeDragStop={(_, node) => {
                  if (node.type === 'groupCard' && selectedSpaceId) {
                    setGroupNodePositionsBySpaceId((current) => ({
                      ...current,
                      [selectedSpaceId]: {
                        ...(current[selectedSpaceId] ?? {}),
                        [node.id]: {
                          x: node.position.x,
                          y: node.position.y,
                        },
                      },
                    }));
                    return;
                  }

                  if (node.type === 'entityCard') {
                    setLayoutDirty(true);
                  }
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
      <EntityDocumentDialog
        open={!!documentEditorEntity}
        entity={documentEditorEntity}
        currentDocumentId={documentEditorDocumentId}
        draft={documentEditorDraft}
        entities={entities}
        linkDefinitions={linkDefinitions}
        linkedEntities={linkedDocumentEntities}
        backlinks={documentBacklinks}
        loading={documentLoading}
        saving={documentSaveBusy}
        busy={!token || !selectedSpaceId || !!busyLabel || !canEditSelectedWorkspace}
        collaboration={documentCollaborationConfig}
        onClose={closeEntityDocumentWithAutosave}
        onSave={() => void saveEntityDocument()}
        onOpenEntity={(entityId, groupId) => {
          openEntityDocumentWithAutosave(entityId, groupId);
        }}
        onOpenBacklink={(backlink) => {
          openDocumentFromBacklinkWithAutosave(backlink);
        }}
        onDraftChange={(draft) => {
          setDocumentEditorTitle(draft.title);
          setDocumentEditorBody(draft.body);
        }}
      />
    </main>
  );
}
