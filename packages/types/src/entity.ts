import type { JsonObject } from './json';
import type { UserId } from './user';
import type { GroupId, SpaceId, WorkspaceId } from './workspace';

export type EntityId = string;
export type EntityTypeId = string;
export type EntityTypeFieldId = string;

export type EntityFieldType =
  | 'text'
  | 'rich_text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'relation'
  | 'user'
  | 'url'
  | 'status';

export interface EntityFieldOption {
  value: string;
  label: string;
  color: string | null;
}

export interface EntityTypeFieldRecord {
  id: EntityTypeFieldId;
  workspaceId: WorkspaceId;
  entityTypeId: EntityTypeId;
  key: string;
  label: string;
  fieldType: EntityFieldType;
  description: string | null;
  required: boolean;
  order: number;
  config: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface EntityRecord {
  id: EntityId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  groupId: GroupId | null;
  entityTypeId: EntityTypeId | null;
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
  color: string | null;
  icon: string | null;
  isSystem: boolean;
  fields: EntityTypeFieldRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface EntityDetailRecord {
  entity: EntityRecord;
  entityType: EntityTypeRecord | null;
  availableEntityTypes: EntityTypeRecord[];
}
