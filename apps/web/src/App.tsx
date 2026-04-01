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
  EntityRecord,
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
    setRelations([]);
    setNodes([]);
    setEdges([]);
    setEdgeLayouts([]);
    setCanvasState(null);
    setSelectedWorkspaceId('');
    setSelectedSpaceId('');
    setSelectedEntityId(null);
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
  ) => {
    const graph = buildCanvasGraph({
      entities: nextEntities,
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

  const loadSpaces = async (activeToken: string, workspaceId: string) => {
    const response = await canvasApi.listSpaces(activeToken, workspaceId);
    setSpaces(response.items);

    if (!response.items.some((space) => space.id === selectedSpaceId)) {
      setSelectedSpaceId(response.items[0]?.id ?? '');
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
      await loadSpaces(token, selectedWorkspaceId);
    });
  }, [selectedWorkspaceId, token]);

  useEffect(() => {
    if (!token || !selectedSpaceId) {
      return;
    }

    void loadCanvas(token, selectedSpaceId);
  }, [selectedSpaceId, token]);

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

  return (
    <main className="s3-app">
      <header className="s3-hero">
        <div className="s3-hero__copy">
          <span className="eyebrow">Ryba S-3 базовая канва</span>
          <h1>Живая канва поверх ядра данных</h1>
          <p>
            Это первый рабочий визуальный слой поверх реальных сущностей и связей.
            Дважды кликни по канве, чтобы создать узел, перетаскивай карточки для настройки
            макета и соединяй хендлы, чтобы создавать связи.
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
            <span>Записи</span>
            <strong>
              {entities.length} / {relations.length}
            </strong>
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
                  void withAction('Обновление пространств', () => loadSpaces(token, selectedWorkspaceId))
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
              <h2>Инспектор</h2>
              <span>{selectedEntity ? selectedEntity.title : 'ничего не выбрано'}</span>
            </div>
            {selectedEntity ? (
              <div className="inspector">
                <div className="inspector__identity">
                  <strong>{selectedEntity.title}</strong>
                  <span>{selectedEntity.id}</span>
                </div>
                <p>{selectedEntity.summary ?? 'Описания пока нет.'}</p>
                <dl className="meta-grid">
                  <div>
                    <dt>Входящие/исходящие</dt>
                    <dd>{relatedToSelectedEntity.length}</dd>
                  </div>
                  <div>
                    <dt>Обновлено</dt>
                    <dd>{new Date(selectedEntity.updatedAt).toLocaleDateString()}</dd>
                  </div>
                </dl>
                <div className="inspector__relations">
                  {relatedToSelectedEntity.length === 0 ? (
                    <p>Связей пока нет.</p>
                  ) : (
                    <ul className="compact-list">
                      {relatedToSelectedEntity.map((relation) => (
                        <li key={relation.id}>
                          <strong>{relation.relationType}</strong>
                          <span>
                            {relation.fromEntityId} → {relation.toEntityId}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="panel__hint">
                Нажми на карточку сущности, чтобы посмотреть её метаданные и связанные записи.
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
                fitView={!canvasState?.updatedAt}
                fitViewOptions={{ padding: 0.24 }}
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
