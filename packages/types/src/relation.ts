import type { JsonObject } from './json';
import type { EntityId, WorkspaceId } from './entity';

export type RelationId = string;

export interface RelationRecord {
  id: RelationId;
  workspaceId: WorkspaceId;
  fromEntityId: EntityId;
  toEntityId: EntityId;
  relationType: string;
  properties: JsonObject;
  createdAt: string;
  updatedAt: string;
}
