import type { EntityId } from './entity';
import type { RelationId } from './relation';
import type { GroupId, SpaceId } from './workspace';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasNodeLayout {
  entityId: EntityId;
  position: CanvasPoint;
  size: CanvasSize | null;
  zIndex: number;
  collapsed: boolean;
}

export interface CanvasEdgeLayout {
  relationId: RelationId;
  fromEntityId: EntityId;
  toEntityId: EntityId;
  controlPoints: CanvasPoint[];
}

export interface CanvasViewport {
  zoom: number;
  offset: CanvasPoint;
}

export interface CanvasLayout {
  nodes: CanvasNodeLayout[];
  edges: CanvasEdgeLayout[];
  viewport: CanvasViewport;
}

export interface CanvasStateInput extends CanvasLayout {}

export interface CanvasStateRecord extends CanvasLayout {
  spaceId: SpaceId;
  groupId: GroupId | null;
  updatedAt: string | null;
}
