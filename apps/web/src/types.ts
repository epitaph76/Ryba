import type { Edge, Node } from 'reactflow';
import type { EntityId } from '@ryba/types';

export type PrototypeId = 'canvas' | 'table' | 'editor' | 'core';

export type EntityNodeData = {
  title: string;
  entityId: EntityId;
  kind: string;
  note: string;
};

export type DemoCanvasNode = Node<EntityNodeData>;
export type DemoCanvasEdge = Edge;

export type DemoRow = {
  id: string;
  entityId: EntityId;
  title: string;
  owner: string;
  status: 'draft' | 'active' | 'blocked' | 'archived';
  updatedAt: string;
};

export type EditorSnapshot = {
  text: string;
  characterCount: number;
  wordCount: number;
  entityRefs: string[];
};
