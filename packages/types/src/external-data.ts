import type { JsonObject } from './json';
import type { UserId } from './user';
import type { GroupId, SpaceId, WorkspaceId } from './workspace';

export type DataSourceId = string;
export type DataSourceKind = 'postgres';

export interface DataSourceRecord {
  id: DataSourceId;
  workspaceId: WorkspaceId;
  kind: DataSourceKind;
  name: string;
  description: string | null;
  host: string;
  port: number | null;
  databaseName: string;
  username: string;
  sslMode: string | null;
  createdByUserId: UserId;
  updatedByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}

export type SavedQueryId = string;
export type SavedQueryParameterType = 'text' | 'number' | 'boolean' | 'date';
export type SavedQueryParameterValue = string | number | boolean | null;

export interface SavedQueryParameterDefinition {
  name: string;
  label: string;
  type: SavedQueryParameterType;
  required: boolean;
  description: string | null;
  defaultValue: SavedQueryParameterValue;
}

export interface SavedQueryRecord {
  id: SavedQueryId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  groupId: GroupId | null;
  dataSourceId: DataSourceId;
  name: string;
  description: string | null;
  sqlTemplate: string;
  parameterDefinitions: SavedQueryParameterDefinition[];
  createdByUserId: UserId;
  updatedByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}

export type QueryRunId = string;
export type QueryRunStatus = 'succeeded' | 'failed';

export interface QueryResultColumnRecord {
  key: string;
  label: string;
  dataType: string;
}

export interface QueryRunRecord {
  id: QueryRunId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  groupId: GroupId | null;
  savedQueryId: SavedQueryId;
  dataSourceId: DataSourceId;
  actorUserId: UserId;
  status: QueryRunStatus;
  parameters: JsonObject;
  rowCount: number;
  truncated: boolean;
  columns: QueryResultColumnRecord[];
  rows: JsonObject[];
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
}
