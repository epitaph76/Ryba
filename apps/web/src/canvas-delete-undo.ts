import type {
  CanvasEdgeLayout,
  CanvasNodeLayout,
  CanvasStateRecord,
  DocumentRecord,
  EntityRecord,
  EntityTypeRecord,
  RelationRecord,
} from '@ryba/types';

import {
  buildCanvasGraph,
  type CanvasEntityNode,
  type CanvasRelationEdge,
} from './canvas-model';

type IndexedValue<TValue> = {
  index: number;
  value: TValue;
};

export interface PendingEntityDeletion {
  entity: EntityRecord;
  entityIndex: number;
  nodeLayout: CanvasNodeLayout;
  nodeIndex: number;
  relations: Array<IndexedValue<RelationRecord>>;
  edgeLayouts: Array<IndexedValue<CanvasEdgeLayout>>;
  documents: Array<IndexedValue<DocumentRecord>>;
}

export interface CanvasDeletionStateInput {
  spaceId: string;
  groupId: string | null;
  entityTypes: EntityTypeRecord[];
  entities: EntityRecord[];
  relations: RelationRecord[];
  nodes: CanvasEntityNode[];
  edgeLayouts: CanvasEdgeLayout[];
  viewport: CanvasStateRecord['viewport'];
  canvasUpdatedAt: string | null;
  documents: DocumentRecord[];
  selectedEntityId: string | null;
}

export interface CanvasDeletionState {
  entities: EntityRecord[];
  relations: RelationRecord[];
  nodes: CanvasEntityNode[];
  edges: CanvasRelationEdge[];
  edgeLayouts: CanvasEdgeLayout[];
  canvasState: CanvasStateRecord;
  documents: DocumentRecord[];
  selectedEntityId: string | null;
}

const clampInsertIndex = (length: number, index: number) => Math.max(0, Math.min(index, length));

const insertManyAtIndexes = <TValue>(
  items: TValue[],
  snapshots: Array<IndexedValue<TValue>>,
) => {
  const next = items.slice();

  for (const snapshot of snapshots.slice().sort((left, right) => left.index - right.index)) {
    next.splice(clampInsertIndex(next.length, snapshot.index), 0, snapshot.value);
  }

  return next;
};

const cloneEdgeLayout = (layout: CanvasEdgeLayout): CanvasEdgeLayout => ({
  relationId: layout.relationId,
  fromEntityId: layout.fromEntityId,
  toEntityId: layout.toEntityId,
  controlPoints: layout.controlPoints.map((point) => ({
    x: point.x,
    y: point.y,
  })),
});

const cloneNodeLayout = (layout: CanvasNodeLayout): CanvasNodeLayout => ({
  entityId: layout.entityId,
  position: {
    x: layout.position.x,
    y: layout.position.y,
  },
  size: layout.size
    ? {
        width: layout.size.width,
        height: layout.size.height,
      }
    : null,
  zIndex: layout.zIndex,
  collapsed: layout.collapsed,
});

const toNodeLayout = (node: CanvasEntityNode, index: number): CanvasNodeLayout => ({
  entityId: node.id,
  position: {
    x: node.position.x,
    y: node.position.y,
  },
  size:
    typeof node.width === 'number' && typeof node.height === 'number'
      ? {
          width: node.width,
          height: node.height,
        }
      : null,
  zIndex: node.zIndex ?? index + 1,
  collapsed: false,
});

const buildDeletionState = (
  input: Omit<CanvasDeletionStateInput, 'nodes' | 'selectedEntityId'> & {
    nodeLayouts: CanvasNodeLayout[];
    selectedEntityId: string | null;
  },
): CanvasDeletionState => {
  const canvasState: CanvasStateRecord = {
    spaceId: input.spaceId,
    groupId: input.groupId,
    nodes: input.nodeLayouts.map(cloneNodeLayout),
    edges: input.edgeLayouts.map(cloneEdgeLayout),
    viewport: input.viewport,
    updatedAt: input.canvasUpdatedAt,
  };
  const graph = buildCanvasGraph({
    entities: input.entities,
    entityTypes: input.entityTypes,
    relations: input.relations,
    canvas: canvasState,
    selectedEntityId: input.selectedEntityId,
  });

  return {
    entities: input.entities,
    relations: input.relations,
    nodes: graph.nodes,
    edges: graph.edges,
    edgeLayouts: input.edgeLayouts,
    canvasState,
    documents: input.documents,
    selectedEntityId: input.selectedEntityId,
  };
};

export function stageEntityDeletion(
  input: CanvasDeletionStateInput,
  entityId: string,
): { pendingDeletion: PendingEntityDeletion; nextState: CanvasDeletionState } | null {
  const entityIndex = input.entities.findIndex((entity) => entity.id === entityId);
  const nodeLayouts = input.nodes.map((node, index) => toNodeLayout(node, index));
  const nodeIndex = nodeLayouts.findIndex((nodeLayout) => nodeLayout.entityId === entityId);

  if (entityIndex === -1 || nodeIndex === -1) {
    return null;
  }

  const entity = input.entities[entityIndex];
  const nodeLayout = nodeLayouts[nodeIndex];

  if (!entity || !nodeLayout) {
    return null;
  }

  const removedRelations = input.relations.flatMap((relation, index) =>
    relation.fromEntityId === entityId || relation.toEntityId === entityId
      ? [{ index, value: relation }]
      : [],
  );
  const removedRelationIds = new Set(removedRelations.map((item) => item.value.id));
  const removedEdgeLayouts = input.edgeLayouts.flatMap((layout, index) =>
    removedRelationIds.has(layout.relationId)
      ? [{ index, value: cloneEdgeLayout(layout) }]
      : [],
  );
  const removedDocuments = input.documents.flatMap((document, index) =>
    document.entityId === entityId
      ? [{ index, value: document }]
      : [],
  );

  const nextState = buildDeletionState({
    spaceId: input.spaceId,
    groupId: input.groupId,
    entityTypes: input.entityTypes,
    entities: input.entities.filter((item) => item.id !== entityId),
    relations: input.relations.filter((relation) => !removedRelationIds.has(relation.id)),
    nodeLayouts: nodeLayouts.filter((layout) => layout.entityId !== entityId),
    edgeLayouts: input.edgeLayouts.filter((layout) => !removedRelationIds.has(layout.relationId)),
    viewport: input.viewport,
    canvasUpdatedAt: input.canvasUpdatedAt,
    documents: input.documents.filter((document) => document.entityId !== entityId),
    selectedEntityId: null,
  });

  return {
    pendingDeletion: {
      entity,
      entityIndex,
      nodeLayout: cloneNodeLayout(nodeLayout),
      nodeIndex,
      relations: removedRelations,
      edgeLayouts: removedEdgeLayouts,
      documents: removedDocuments,
    },
    nextState,
  };
}

export function restoreDeletedEntity(
  input: CanvasDeletionStateInput,
  pendingDeletion: PendingEntityDeletion,
): CanvasDeletionState {
  const currentNodeLayouts = input.nodes.map((node, index) => toNodeLayout(node, index));

  if (input.entities.some((entity) => entity.id === pendingDeletion.entity.id)) {
    return buildDeletionState({
      spaceId: input.spaceId,
      groupId: input.groupId,
      entityTypes: input.entityTypes,
      entities: input.entities,
      relations: input.relations,
      nodeLayouts: currentNodeLayouts,
      edgeLayouts: input.edgeLayouts,
      viewport: input.viewport,
      canvasUpdatedAt: input.canvasUpdatedAt,
      documents: input.documents,
      selectedEntityId: input.selectedEntityId,
    });
  }

  return buildDeletionState({
    spaceId: input.spaceId,
    groupId: input.groupId,
    entityTypes: input.entityTypes,
    entities: insertManyAtIndexes(input.entities, [
      {
        index: pendingDeletion.entityIndex,
        value: pendingDeletion.entity,
      },
    ]),
    relations: insertManyAtIndexes(input.relations, pendingDeletion.relations),
    nodeLayouts: insertManyAtIndexes(currentNodeLayouts, [
      {
        index: pendingDeletion.nodeIndex,
        value: cloneNodeLayout(pendingDeletion.nodeLayout),
      },
    ]),
    edgeLayouts: insertManyAtIndexes(
      input.edgeLayouts,
      pendingDeletion.edgeLayouts.map((snapshot) => ({
        index: snapshot.index,
        value: cloneEdgeLayout(snapshot.value),
      })),
    ),
    viewport: input.viewport,
    canvasUpdatedAt: input.canvasUpdatedAt,
    documents: insertManyAtIndexes(input.documents, pendingDeletion.documents),
    selectedEntityId: pendingDeletion.entity.id,
  });
}
