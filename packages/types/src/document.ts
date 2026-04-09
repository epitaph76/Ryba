import type { EntityId, EntityTypeId } from './entity';
import type { GroupId, SpaceId, WorkspaceId } from './workspace';
import type { UserId } from './user';
import type { DocumentLinkMode } from './document-link';

export type DocumentId = string;

export interface DocumentEntityReference {
  entityId: EntityId;
  label: string | null;
  anchorId: string | null;
  kind?: 'entity_mention' | 'document_link_definition' | 'document_link_usage';
  linkKey?: string | null;
  definitionKey?: string | null;
  linkText?: string | null;
  linkMode?: DocumentLinkMode | null;
  sourceDocumentId?: DocumentId | null;
  sourceBlockId?: string | null;
  sourceGroupId?: GroupId | null;
  sourceGroupSlug?: string | null;
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
  groupId: GroupId | null;
  entityId: EntityId;
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
  groupId: GroupId | null;
  groupSlug: string | null;
}

export interface DocumentDetailRecord {
  document: DocumentRecord;
  entity: {
    id: EntityId;
    title: string;
    summary: string | null;
    entityTypeId: EntityTypeId | null;
  };
  mentions: DocumentEntityReference[];
  mentionedEntities: DocumentEntityPreview[];
}

export interface DocumentBacklinkRecord {
  entityId: EntityId;
  sourceEntityId: EntityId;
  documentId: DocumentId;
  documentTitle: string;
  label: string | null;
  anchorId: string | null;
  previewText: string;
  updatedAt: string;
  sourceGroupId: GroupId | null;
  sourceGroupSlug: string | null;
}
