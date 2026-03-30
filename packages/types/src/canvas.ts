import type { EntityId } from './entity';
import type { RelationId } from './relation';

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
