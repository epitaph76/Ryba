import type { JsonObject } from './json';
import type { UserId } from './user';
import type { SpaceId, WorkspaceId } from './workspace';

export type EntityId = string;
export type EntityTypeId = string;

export interface EntityRecord {
  id: EntityId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  title: string;
  summary: string | null;
  properties: JsonObject;
  createdByUserId: UserId;
  updatedByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}

export interface EntityTypeRecord {
  id: EntityTypeId;
  workspaceId: WorkspaceId;
  name: string;
  slug: string;
  description: string | null;
  schema: JsonObject;
  createdAt: string;
  updatedAt: string;
}
