import { canvasLayoutSchema } from '@ryba/schemas';
import type {
  CanvasStateRecord,
  EntityRecord,
  JsonObject,
  RelationRecord,
  SpaceRecord,
  UserRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
} from '@ryba/types';

import type {
  entities,
  relations,
  spaceCanvasStates,
  spaces,
  users,
  workspaceMembers,
  workspaces,
} from './schema';

type UserRow = typeof users.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type EntityRow = typeof entities.$inferSelect;
type RelationRow = typeof relations.$inferSelect;
type SpaceCanvasStateRow = typeof spaceCanvasStates.$inferSelect;

const ensureJsonObject = (value: unknown): JsonObject => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
};

export const toUserRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toWorkspaceRecord = (row: WorkspaceRow): WorkspaceRecord => ({
  id: row.id,
  ownerUserId: row.ownerUserId,
  name: row.name,
  slug: row.slug,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toWorkspaceMemberRecord = (
  row: WorkspaceMemberRow,
): WorkspaceMemberRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  role: row.role as WorkspaceMemberRecord['role'],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSpaceRecord = (row: SpaceRow): SpaceRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  createdByUserId: row.createdByUserId,
  name: row.name,
  slug: row.slug,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toEntityRecord = (row: EntityRow): EntityRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  title: row.title,
  summary: row.summary,
  properties: ensureJsonObject(row.properties),
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toRelationRecord = (row: RelationRow): RelationRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  fromEntityId: row.fromEntityId,
  toEntityId: row.toEntityId,
  relationType: row.relationType,
  properties: ensureJsonObject(row.properties),
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toCanvasStateRecord = (row: SpaceCanvasStateRow): CanvasStateRecord => {
  const layout = canvasLayoutSchema.parse(row.layout);

  return {
    spaceId: row.spaceId,
    nodes: layout.nodes,
    edges: layout.edges,
    viewport: layout.viewport,
    updatedAt: row.updatedAt,
  };
};
