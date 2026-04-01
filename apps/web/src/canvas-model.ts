import { MarkerType, type Edge, type Node } from 'reactflow';
import type {
  CanvasEdgeLayout,
  CanvasStateInput,
  CanvasStateRecord,
  EntityRecord,
  RelationRecord,
} from '@ryba/types';

export type CanvasEntityNodeData = {
  entityId: string;
  title: string;
  summary: string | null;
  relationCount: number;
};

export type CanvasEntityNode = Node<CanvasEntityNodeData>;
export type CanvasRelationEdge = Edge<{ relationId: string; relationType: string }>;

export function buildCanvasGraph(input: {
  entities: EntityRecord[];
  relations: RelationRecord[];
  canvas: CanvasStateRecord;
  selectedEntityId: string | null;
}): { nodes: CanvasEntityNode[]; edges: CanvasRelationEdge[] } {
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
  const relationById = new Map(input.relations.map((relation) => [relation.id, relation]));

  const nodes: CanvasEntityNode[] = [];
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
      selected: input.selectedEntityId === entity.id,
      data: {
        entityId: entity.id,
        title: entity.title,
        summary: entity.summary,
        relationCount: relationCountByEntityId.get(entity.id) ?? 0,
      },
    });
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
      type: 'smoothstep',
      animated: false,
      label: relation.relationType,
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
  nodes: CanvasEntityNode[];
  edgeLayouts: CanvasEdgeLayout[];
  viewport: CanvasStateRecord['viewport'];
}): { spaceId: string; payload: CanvasStateInput } {
  const edgeLayoutById = new Map(
    input.edgeLayouts.map((layout) => [layout.relationId, layout]),
  );

  return {
    spaceId: input.spaceId,
    payload: {
      nodes: input.nodes.map((node, index) => ({
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
