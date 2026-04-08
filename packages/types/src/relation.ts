import type { JsonObject } from './json';
import type { EntityId } from './entity';
import type { UserId } from './user';
import type { GroupId, SpaceId, WorkspaceId } from './workspace';

export type RelationId = string;

export interface RelationRecord {
  id: RelationId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  groupId: GroupId | null;
  fromEntityId: EntityId;
  toEntityId: EntityId;
  relationType: string;
  properties: JsonObject;
  createdByUserId: UserId;
  updatedByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}
