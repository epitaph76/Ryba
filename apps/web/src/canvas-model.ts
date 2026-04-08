import { MarkerType, Position, type Edge, type Node } from 'reactflow';
import type {
  CanvasEdgeLayout,
  CanvasStateInput,
  CanvasStateRecord,
  DocumentLinkMode,
  EntityRecord,
  EntityTypeRecord,
  GroupRecord,
  RelationRecord,
} from '@ryba/types';

export type CanvasEntityNodeData = {
  entityId: string;
  title: string;
  summary: string | null;
  entityTypeName: string | null;
  relationCount: number;
};

export type CanvasGroupNodeData = {
  groupId: string;
  name: string;
  slug: string;
  description: string | null;
  onOpenGroup?: ((groupId: string) => void) | undefined;
};

export type CanvasNodeData = CanvasEntityNodeData | CanvasGroupNodeData;

export type CanvasEntityNode = Node<CanvasEntityNodeData>;
export type CanvasGroupNode = Node<CanvasGroupNodeData>;
export type CanvasNode = Node<CanvasNodeData>;
export type CanvasRelationEdge = Edge<{ relationId: string; relationType: string }>;

export const isCanvasEntityNode = (node: CanvasNode): node is CanvasEntityNode =>
  node.type === 'entityCard';

const getRelationLinkMode = (relation: RelationRecord): DocumentLinkMode | null => {
  const linkMode = relation.properties.linkMode;

  if (linkMode === 'static' || linkMode === 'sync') {
    return linkMode;
  }

  return null;
};

const getGroupNodePosition = (
  index: number,
  layouts: CanvasStateRecord['nodes'],
) => {
  const maxX = layouts.reduce(
    (currentMax, layout) => Math.max(currentMax, layout.position.x + (layout.size?.width ?? 260)),
    96,
  );
  const column = index % 2;
  const row = Math.floor(index / 2);

  return {
    x: maxX + 240 + column * 320,
    y: 96 + row * 196,
  };
};

export function buildCanvasGraph(input: {
  entities: EntityRecord[];
  entityTypes: EntityTypeRecord[];
  groups?: GroupRecord[];
  groupNodePositions?: Record<string, { x: number; y: number }>;
  onOpenGroup?: ((groupId: string) => void) | undefined;
  relations: RelationRecord[];
  canvas: CanvasStateRecord;
  selectedEntityId: string | null;
}): { nodes: CanvasNode[]; edges: CanvasRelationEdge[] } {
  const relationCountByEntityId = new Map<string, number>();

  for (const relation of input.relations) {
    relationCountByEntityId.set(
      relation.fromEntityId,
      (relationCountByEntityId.get(relation.fromEntityId) ?? 0) + 1,
    );
    relationCountByEntityId.set(
      relation.toEntityId,
      (relationCountByEntityId.get(relation.toEntityId) ?? 0) + 1,
    );
  }

  const entityById = new Map(input.entities.map((entity) => [entity.id, entity]));
  const entityTypeById = new Map(input.entityTypes.map((entityType) => [entityType.id, entityType]));
  const relationById = new Map(input.relations.map((relation) => [relation.id, relation]));

  const nodes: CanvasNode[] = [];
  const edges: CanvasRelationEdge[] = [];

  for (const layout of input.canvas.nodes) {
    const entity = entityById.get(layout.entityId);

    if (!entity) {
      continue;
    }

    nodes.push({
      id: entity.id,
      type: 'entityCard',
      position: layout.position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      selected: input.selectedEntityId === entity.id,
      data: {
        entityId: entity.id,
        title: entity.title,
        summary: entity.summary,
        entityTypeName: entity.entityTypeId
          ? entityTypeById.get(entity.entityTypeId)?.name ?? 'Typed record'
          : null,
        relationCount: relationCountByEntityId.get(entity.id) ?? 0,
      },
    });
  }

  if (input.canvas.groupId === null) {
    for (const [index, group] of (input.groups ?? []).entries()) {
      nodes.push({
        id: group.id,
        type: 'groupCard',
        position: input.groupNodePositions?.[group.id] ?? getGroupNodePosition(index, input.canvas.nodes),
        draggable: true,
        connectable: false,
        deletable: false,
        selected: false,
        data: {
          groupId: group.id,
          name: group.name,
          slug: group.slug,
          description: group.description,
          onOpenGroup: input.onOpenGroup,
        },
      });
    }
  }

  for (const layout of input.canvas.edges) {
    const relation = relationById.get(layout.relationId);

    if (!relation) {
      continue;
    }

    edges.push({
      id: relation.id,
      source: relation.fromEntityId,
      target: relation.toEntityId,
      type: relation.relationType === 'document_link' ? 'bezier' : 'smoothstep',
      animated: false,
      label: relation.relationType === 'document_link' ? undefined : relation.relationType,
      markerStart:
        relation.relationType === 'document_link' && getRelationLinkMode(relation) === 'sync'
          ? {
              type: MarkerType.ArrowClosed,
            }
          : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      data: {
        relationId: relation.id,
        relationType: relation.relationType,
      },
    });
  }

  return { nodes, edges };
}

export function serializeCanvasState(input: {
  spaceId: string;
  nodes: CanvasNode[];
  edgeLayouts: CanvasEdgeLayout[];
  viewport: CanvasStateRecord['viewport'];
}): { spaceId: string; payload: CanvasStateInput } {
  const edgeLayoutById = new Map(
    input.edgeLayouts.map((layout) => [layout.relationId, layout]),
  );
  const entityNodes = input.nodes.filter(isCanvasEntityNode);

  return {
    spaceId: input.spaceId,
    payload: {
      nodes: entityNodes.map((node, index) => ({
        entityId: node.id,
        position: node.position,
        size:
          typeof node.width === 'number' && typeof node.height === 'number'
            ? { width: node.width, height: node.height }
            : null,
        zIndex: node.zIndex ?? index + 1,
        collapsed: false,
      })),
      edges: Array.from(edgeLayoutById.values()).map((layout) => ({
        relationId: layout.relationId,
        fromEntityId: layout.fromEntityId,
        toEntityId: layout.toEntityId,
        controlPoints: layout.controlPoints,
      })),
      viewport: input.viewport,
    },
  };
}
