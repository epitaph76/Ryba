import type { EntityTypeId } from './entity';
import type { UserId } from './user';
import type { GroupId, SpaceId, WorkspaceId } from './workspace';

export type SavedViewId = string;
export type SavedViewMode = 'table' | 'list';
export type SavedViewFieldSource = 'system' | 'property';
export type SavedViewSortDirection = 'asc' | 'desc';
export type SavedViewFilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty';

export type SavedViewFilterValue = string | number | boolean | string[] | null;

export interface SavedViewColumnConfig {
  key: string;
  source: SavedViewFieldSource;
  visible: boolean;
  width: number | null;
}

export interface SavedViewFilterConfig {
  id: string;
  key: string;
  source: SavedViewFieldSource;
  operator: SavedViewFilterOperator;
  value: SavedViewFilterValue;
}

export interface SavedViewSortConfig {
  key: string;
  source: SavedViewFieldSource;
  direction: SavedViewSortDirection;
}

export interface SavedViewConfig {
  filters: SavedViewFilterConfig[];
  sort: SavedViewSortConfig[];
  columns: SavedViewColumnConfig[];
}

export interface SavedViewRecord {
  id: SavedViewId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  groupId: GroupId | null;
  name: string;
  description: string | null;
  entityTypeId: EntityTypeId | null;
  viewType: SavedViewMode;
  config: SavedViewConfig;
  createdByUserId: UserId;
  updatedByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}
