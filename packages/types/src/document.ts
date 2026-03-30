import type { EntityId } from './entity';
import type { SpaceId, WorkspaceId } from './workspace';

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
  workspaceId: WorkspaceId;
  spaceId: SpaceId | null;
  title: string;
  body: DocumentBlock[];
  createdAt: string;
  updatedAt: string;
}
