import { describe, expect, it } from 'vitest';
import type { DocumentRecord, EntityRecord, EntityTypeRecord, RelationRecord } from '@ryba/types';

import {
  restoreDeletedEntity,
  stageEntityDeletion,
  type CanvasDeletionStateInput,
} from './canvas-delete-undo';
import type { CanvasEntityNode } from './canvas-model';

const entityTypes: EntityTypeRecord[] = [
  {
    id: 'type-company',
    workspaceId: 'workspace-1',
    name: 'Company',
    slug: 'company',
    description: null,
    color: null,
    icon: null,
    isSystem: false,
    fields: [],
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

const entities: EntityRecord[] = [
  {
    id: 'entity-a',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    groupId: null,
    entityTypeId: 'type-company',
    title: 'Alpha',
    summary: 'First',
    properties: {},
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'entity-b',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    groupId: null,
    entityTypeId: null,
    title: 'Beta',
    summary: 'Second',
    properties: {},
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

const relations: RelationRecord[] = [
  {
    id: 'relation-1',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    groupId: null,
    fromEntityId: 'entity-a',
    toEntityId: 'entity-b',
    relationType: 'depends_on',
    properties: {},
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

const documents: DocumentRecord[] = [
  {
    id: 'document-b',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    groupId: null,
    entityId: 'entity-b',
    title: 'Beta note',
    body: [],
    previewText: '',
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

const nodes: CanvasEntityNode[] = [
  {
    id: 'entity-a',
    type: 'entityCard',
    position: { x: 80, y: 100 },
    data: {
      entityId: 'entity-a',
      title: 'Alpha',
      summary: 'First',
      entityTypeName: 'Company',
      relationCount: 1,
    },
    selected: false,
  },
  {
    id: 'entity-b',
    type: 'entityCard',
    position: { x: 360, y: 220 },
    data: {
      entityId: 'entity-b',
      title: 'Beta',
      summary: 'Second',
      entityTypeName: null,
      relationCount: 1,
    },
    selected: true,
  },
];

const baseState: CanvasDeletionStateInput = {
  spaceId: 'space-1',
  groupId: null,
  entityTypes,
  entities,
  relations,
  nodes,
  edgeLayouts: [
    {
      relationId: 'relation-1',
      fromEntityId: 'entity-a',
      toEntityId: 'entity-b',
      controlPoints: [],
    },
  ],
  viewport: {
    zoom: 1,
    offset: { x: 0, y: 0 },
  },
  canvasUpdatedAt: '2026-04-08T10:00:00.000Z',
  documents,
  selectedEntityId: 'entity-b',
};

describe('canvas-delete-undo', () => {
  it('stages entity deletion by removing the entity, related edges and its document', () => {
    const staged = stageEntityDeletion(baseState, 'entity-b');

    expect(staged).not.toBeNull();
    expect(staged?.nextState.entities.map((entity) => entity.id)).toEqual(['entity-a']);
    expect(staged?.nextState.relations).toHaveLength(0);
    expect(staged?.nextState.edgeLayouts).toHaveLength(0);
    expect(staged?.nextState.documents).toHaveLength(0);
    expect(staged?.nextState.nodes.map((node) => node.id)).toEqual(['entity-a']);
    expect(staged?.nextState.selectedEntityId).toBeNull();
    expect(staged?.pendingDeletion.nodeLayout.position).toEqual({ x: 360, y: 220 });
  });

  it('restores a deleted entity without overwriting movements made after the delete', () => {
    const staged = stageEntityDeletion(baseState, 'entity-b');

    if (!staged) {
      throw new Error('Expected staged deletion snapshot');
    }

    const movedCurrentState: CanvasDeletionStateInput = {
      ...baseState,
      entities: staged.nextState.entities,
      relations: staged.nextState.relations,
      nodes: staged.nextState.nodes.map((node) =>
        node.id === 'entity-a'
          ? {
              ...node,
              position: { x: 520, y: 640 },
            }
          : node,
      ),
      edgeLayouts: staged.nextState.edgeLayouts,
      documents: staged.nextState.documents,
      selectedEntityId: staged.nextState.selectedEntityId,
    };
    const restored = restoreDeletedEntity(movedCurrentState, staged.pendingDeletion);

    expect(restored.entities.map((entity) => entity.id)).toEqual(['entity-a', 'entity-b']);
    expect(restored.relations.map((relation) => relation.id)).toEqual(['relation-1']);
    expect(restored.documents.map((document) => document.id)).toEqual(['document-b']);
    expect(restored.selectedEntityId).toBe('entity-b');
    expect(restored.nodes.find((node) => node.id === 'entity-a')?.position).toEqual({
      x: 520,
      y: 640,
    });
    expect(restored.nodes.find((node) => node.id === 'entity-b')?.position).toEqual({
      x: 360,
      y: 220,
    });
    expect(restored.edges.map((edge) => edge.id)).toEqual(['relation-1']);
  });
});
