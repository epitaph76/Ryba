import { canvasLayoutSchema, documentBlockSchema, savedViewConfigSchema } from '@ryba/schemas';
import type {
  ActivityActorRecord,
  ActivityEventRecord,
  CanvasStateRecord,
  DocumentBacklinkRecord,
  DocumentEntityPreview,
  DocumentRecord,
  EntityRecord,
  EntityTypeFieldRecord,
  EntityTypeRecord,
  GroupRecord,
  JsonObject,
  RelationRecord,
  SavedViewRecord,
  SpaceRecord,
  UserRecord,
  WorkspaceMemberDetailRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
} from '@ryba/types';

import type {
  activityEvents,
  entities,
  entityTypeFields,
  entityTypes,
  relations,
  documentEntityMentions,
  documents,
  savedViews,
  groups,
  groupCanvasStates,
  spaceCanvasStates,
  spaces,
  users,
  workspaceMembers,
  workspaces,
} from './schema';

type UserRow = typeof users.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;
type ActivityEventRow = typeof activityEvents.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type GroupRow = typeof groups.$inferSelect;
type EntityRow = typeof entities.$inferSelect;
type EntityTypeRow = typeof entityTypes.$inferSelect;
type EntityTypeFieldRow = typeof entityTypeFields.$inferSelect;
type RelationRow = typeof relations.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;
type SavedViewRow = typeof savedViews.$inferSelect;
type DocumentEntityMentionRow = typeof documentEntityMentions.$inferSelect;
type SpaceCanvasStateRow = typeof spaceCanvasStates.$inferSelect;
type GroupCanvasStateRow = typeof groupCanvasStates.$inferSelect;

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
  role: normalizeWorkspaceRole(row.role),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toWorkspaceMemberDetailRecord = (
  row: WorkspaceMemberRow,
  user: Pick<UserRow, 'id' | 'email' | 'displayName'>,
): WorkspaceMemberDetailRecord => ({
  ...toWorkspaceMemberRecord(row),
  user: {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  },
});

export const toActivityActorRecord = (
  row: Pick<UserRow, 'id' | 'email' | 'displayName'>,
): ActivityActorRecord => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
});

export const toActivityEventRecord = (
  row: ActivityEventRow,
  actor: ActivityActorRecord,
): ActivityEventRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  groupId: row.groupId,
  actorUserId: row.actorUserId,
  eventType: row.eventType,
  targetType: row.targetType,
  targetId: row.targetId,
  summary: row.summary,
  metadata: ensureJsonObject(row.metadata),
  createdAt: row.createdAt,
  actor,
});

const normalizeWorkspaceRole = (role: string): WorkspaceMemberRecord['role'] => {
  if (role === 'member') {
    return 'editor';
  }

  return role as WorkspaceMemberRecord['role'];
};

export const toSpaceRecord = (row: SpaceRow): SpaceRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  createdByUserId: row.createdByUserId,
  name: row.name,
  slug: row.slug,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toGroupRecord = (row: GroupRow): GroupRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  createdByUserId: row.createdByUserId,
  name: row.name,
  slug: row.slug,
  description: row.description,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toEntityRecord = (row: EntityRow): EntityRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  groupId: row.groupId,
  entityTypeId: row.entityTypeId,
  title: row.title,
  summary: row.summary,
  properties: ensureJsonObject(row.properties),
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toEntityTypeFieldRecord = (row: EntityTypeFieldRow): EntityTypeFieldRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  entityTypeId: row.entityTypeId,
  key: row.key,
  label: row.label,
  fieldType: row.fieldType as EntityTypeFieldRecord['fieldType'],
  description: row.description,
  required: row.required,
  order: row.order,
  config: ensureJsonObject(row.config),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toEntityTypeRecord = (
  row: EntityTypeRow,
  fields: EntityTypeFieldRecord[],
): EntityTypeRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  name: row.name,
  slug: row.slug,
  description: row.description,
  color: row.color,
  icon: row.icon,
  isSystem: row.isSystem,
  fields,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toRelationRecord = (row: RelationRow): RelationRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  groupId: row.groupId,
  fromEntityId: row.fromEntityId,
  toEntityId: row.toEntityId,
  relationType: row.relationType,
  properties: ensureJsonObject(row.properties),
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toDocumentRecord = (row: DocumentRow): DocumentRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  groupId: row.groupId,
  entityId: row.entityId,
  title: row.title,
  body: documentBlockSchema.array().parse(row.body),
  previewText: row.previewText,
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toSavedViewRecord = (row: SavedViewRow): SavedViewRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  spaceId: row.spaceId,
  groupId: row.groupId,
  name: row.name,
  description: row.description,
  entityTypeId: row.entityTypeId,
  viewType: row.viewType as SavedViewRecord['viewType'],
  config: savedViewConfigSchema.parse(row.config),
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toDocumentEntityPreview = (
  mention: Pick<DocumentEntityMentionRow, 'entityId' | 'label' | 'anchorId'>,
  entity: Pick<EntityRecord, 'title' | 'summary' | 'entityTypeId'>,
): DocumentEntityPreview => ({
  entityId: mention.entityId,
  label: mention.label,
  anchorId: mention.anchorId,
  title: entity.title,
  summary: entity.summary,
  entityTypeId: entity.entityTypeId,
});

export const toDocumentBacklinkRecord = (
  mention: Pick<DocumentEntityMentionRow, 'entityId' | 'label' | 'anchorId'>,
  document: Pick<DocumentRecord, 'id' | 'entityId' | 'title' | 'previewText' | 'updatedAt'>,
): DocumentBacklinkRecord => ({
  entityId: mention.entityId,
  sourceEntityId: document.entityId,
  documentId: document.id,
  documentTitle: document.title,
  label: mention.label,
  anchorId: mention.anchorId,
  previewText: document.previewText,
  updatedAt: document.updatedAt,
});

export const toCanvasStateRecord = (
  row: SpaceCanvasStateRow | GroupCanvasStateRow,
  input: {
    spaceId: string;
    groupId: string | null;
  },
): CanvasStateRecord => {
  const layout = canvasLayoutSchema.parse(row.layout);

  return {
    spaceId: input.spaceId,
    groupId: input.groupId,
    nodes: layout.nodes,
    edges: layout.edges,
    viewport: layout.viewport,
    updatedAt: row.updatedAt,
  };
};
