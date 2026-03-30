import type { JsonObject } from './json';
import type { EntityId } from './entity';
import type { UserId } from './user';
import type { SpaceId, WorkspaceId } from './workspace';

export type RelationId = string;

export interface RelationRecord {
  id: RelationId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  fromEntityId: EntityId;
  toEntityId: EntityId;
  relationType: string;
  properties: JsonObject;
  createdByUserId: UserId;
  updatedByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}
