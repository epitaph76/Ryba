import type { EntityId } from './entity';

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
  id: string;
  workspaceId: string;
  spaceId: string | null;
  title: string;
  body: DocumentBlock[];
  createdAt: string;
  updatedAt: string;
}
