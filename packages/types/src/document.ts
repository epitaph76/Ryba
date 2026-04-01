import type { EntityId, EntityTypeId } from './entity';
import type { SpaceId, WorkspaceId } from './workspace';
import type { UserId } from './user';

export type DocumentId = string;

export interface DocumentEntityReference {
  entityId: EntityId;
  label: string | null;
  anchorId: string | null;
}

export interface DocumentBlock {
  id: string;
  kind: 'paragraph' | 'heading' | 'list_item' | 'entity_reference';
  text: string | null;
  entityReferences: DocumentEntityReference[];
}

export interface DocumentRecord {
  id: DocumentId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  title: string;
  body: DocumentBlock[];
  previewText: string;
  createdByUserId: UserId;
  updatedByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentEntityPreview {
  entityId: EntityId;
  label: string | null;
  anchorId: string | null;
  title: string;
  summary: string | null;
  entityTypeId: EntityTypeId | null;
}

export interface DocumentDetailRecord {
  document: DocumentRecord;
  mentions: DocumentEntityReference[];
  mentionedEntities: DocumentEntityPreview[];
}

export interface DocumentBacklinkRecord {
  entityId: EntityId;
  documentId: DocumentId;
  documentTitle: string;
  label: string | null;
  anchorId: string | null;
  previewText: string;
  updatedAt: string;
}
