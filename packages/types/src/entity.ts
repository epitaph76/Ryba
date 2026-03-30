import type { JsonObject } from './json';

export type EntityId = string;
export type EntityTypeId = string;
export type SpaceId = string;
export type WorkspaceId = string;

export interface EntityRecord {
  id: EntityId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId | null;
  typeId: EntityTypeId | null;
  title: string;
  summary: string | null;
  properties: JsonObject;
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
